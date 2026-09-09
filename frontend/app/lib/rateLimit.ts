// Shared IP-based rate limiting for the pairing API routes.
//
// WebDrop has no accounts, so the only way to identify "who is making these
// requests" is the requester's IP address. When the app runs on Vercel the
// real client IP arrives in the `x-forwarded-for` / `x-real-ip` headers that
// the edge adds (so requests are never allowed to spoof it — we only *read*
// these headers, we never trust a client-set value blindly; we take the first
// entry which Vercel sets server-side).
//
// Each IP gets a Redis counter for a given action. The counter increments on
// every request and expires after a short window. If the count goes over the
// limit within the window we reject the request. This makes brute-forcing
// impossible (or impractically slow) while being totally invisible to normal
// usage.
import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

// How many attempts are allowed, and over what time window (seconds).
type RateLimitRule = { max: number; windowSeconds: number };

// Per-action limits. Chosen so legitimate use never trips them (see below).
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // Joining is the security-critical path: an attacker guesses a 4-digit
  // code. 10 tries / 60s makes testing even codes excruciatingly slow.
  join: { max: 10, windowSeconds: 60 },
  // Creating a room is normal, occasional use — be generous.
  "create-room": { max: 20, windowSeconds: 60 },
  // Signal is polled every ~1.2s during connection setup, plus a burst of
  // SDP/ICE messages while the handshake completes — and since pairing is now
  // keyed per (IP + room code), several sessions from one network no longer
  // share a counter. 90 / 60s leaves comfortable headroom for that.
  signal: { max: 90, windowSeconds: 60 },
};

// Turn a NextRequest into a best-guess client IP string. We prefer the first
// hop of x-forwarded-for (Vercel sets this), then x-real-ip, then a fallback.
export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd && fwd.trim()) {
    // Comma-separated list of proxies; the leftmost is the original client.
    return fwd.split(",")[0].trim();
  }
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}

// Check (and record) a request against an action's rate limit.
// Returns a 429 response if the IP is over the limit, or null if allowed.
//
// @param redis   the Redis client (passed in so callers reuse one instance)
// @param ip      the client IP from clientIp()
// @param action  a key into RATE_LIMITS (e.g. "join")
// @param scope   optional extra discriminator baked into the key, e.g. the
//                room code for the "signal" action (see below)
export async function checkRateLimit(
  redis: Redis,
  ip: string,
  action: string,
  scope?: string,
): Promise<NextResponse | null> {
  const rule = RATE_LIMITS[action];
  // Unknown action: fail open (don't block anything).
  if (!rule) return null;

  // The "signal" limit is keyed by IP AND room code together, so that two
  // different pairing sessions sharing one IP (e.g. multiple devices behind
  // the same WiFi, or testing on a shared dev network) don't eat each other's
  // budget. "join" / "create-room" are intentionally left as pure per-IP,
  // since that's exactly what stops a single attacker guessing codes.
  const key =
    scope !== undefined
      ? `ratelimit:${action}:${ip}:${scope}`
      : `ratelimit:${action}:${ip}`;

  // INCR bumps the counter by 1 and returns the new value. It creates the
  // key on first use. We then set its expiry ONLY the first time so the
  // window is measured from the first request, not refreshed forever.
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, rule.windowSeconds);
  }

  if (count > rule.max) {
    return NextResponse.json(
      { error: "rate-limited", message: "Too many attempts, please wait a moment." },
      { status: 429 },
    );
  }
  return null;
}

// A generous cap on request body size. Legitimate pairing/signaling payloads
// are tiny (a 4-digit code string, an SDP offer/answer, or an ICE candidate),
// so anything over ~10KB is abuse. We reject it before doing any real work so
// an attacker can't use our endpoints as free bandwidth / memory churn.
export const MAX_BODY_BYTES = 10 * 1024; // 10 KB

// Read a request body as JSON while enforcing MAX_BODY_BYTES.
// Returns { ok: true, data } on success, or { ok: false, reason } on failure.
export async function readJsonBody(
  request: NextRequest,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; reason: "invalid-json" | "too-large" }
> {
  const raw = await request.text().catch(() => null);
  // A completely empty body is not a valid JSON payload here.
  if (raw === null || raw.length === 0) {
    return { ok: false, reason: "invalid-json" };
  }
  // Size guard: reject oversized bodies before attempting to parse them.
  if (raw.length > maxBytes) {
    return { ok: false, reason: "too-large" };
  }
  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}