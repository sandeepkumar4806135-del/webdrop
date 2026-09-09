// /api/signal - the "post office" of the app.
//
// POST /api/signal  { code, role, data } -> deliver a message to the OTHER peer
// GET  /api/signal?code=...&role=...    -> fetch (and remove) every message
//                                          waiting for THIS peer
//
// Each role has one inbox in Redis:
//   creator -> queue:{code}:toCreator
//   joiner  -> queue:{code}:toJoiner
// Messages are pushed with RPUSH (added to the end) and read with LPOP
// (taken from the front), so they arrive in the same order they were sent.
import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { checkRateLimit, clientIp } from "../../lib/rateLimit";

// Queues live for 10 minutes after their last message, just like rooms.
const QUEUE_TTL_SECONDS = 600;

// The queue a role READS from (its own inbox)
function inboxKey(code: string, role: string) {
  return role === "creator"
    ? `queue:${code}:toCreator`
    : `queue:${code}:toJoiner`;
}

// The queue a role WRITES to (the other peer's inbox)
function outboxKey(code: string, role: string) {
  return role === "creator"
    ? `queue:${code}:toJoiner`
    : `queue:${code}:toCreator`;
}

// Deliver one message to the other peer
export async function POST(request: NextRequest) {
  // Create the Redis client from UPSTASH_REDIS_REST_URL / _TOKEN
  const redis = Redis.fromEnv();

  // Gentle limit so one IP can't hammer the endpoint with junk messages.
  // Shared counter with the GET below; normal active use stays well under it.
  const limited = await checkRateLimit(redis, clientIp(request), "signal");
  if (limited) return limited;

  // Read { code, role, data } from the request body
  const body = await request.json().catch(() => null);
  const code = body?.code as string | undefined;
  const role = body?.role as string | undefined;
  const data = body?.data;

  // "role" tells us who is SENDING, so we must check it is a known value
  // before we can decide which queue to drop the message into.
  if (
    (role !== "creator" && role !== "joiner") ||
    !code ||
    !/^\d{4}$/.test(code) ||
    data === undefined
  ) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // Push the message onto the other peer's queue, and refresh the queue's
  // expiry at the same time (pipeline = both commands in one round trip).
  const queue = outboxKey(code, role);
  await redis
    .pipeline()
    .rpush(queue, JSON.stringify(data))
    .expire(queue, QUEUE_TTL_SECONDS)
    .exec();

  return NextResponse.json({ success: true });
}

// Fetch (and remove) every message waiting for this peer
export async function GET(request: NextRequest) {
  // Read ?code=...&role=... from the URL
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const role = request.nextUrl.searchParams.get("role") ?? "";

  if ((role !== "creator" && role !== "joiner") || !/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // Create the Redis client from UPSTASH_REDIS_REST_URL / _TOKEN
  const redis = Redis.fromEnv();

  // Gentle limit. Normal use: one side polls this every ~1.2s (~50/min), well
  // under the 60/min cap shared with POST, so active sessions never break.
  const limited = await checkRateLimit(redis, clientIp(request), "signal");
  if (limited) return limited;

  // Pop every message from our inbox, one at a time, until it is empty.
  // Because each LPOP removes exactly one message, nothing is ever delivered
  // twice, even if we poll again immediately.
  // The limit is just a safety net so a runaway loop is impossible.
  const inbox = inboxKey(code, role);
  const rawMessages: unknown[] = [];
  for (let i = 0; i < 500; i++) {
    const item = await redis.lpop(inbox);
    if (item === null || item === undefined) break;
    rawMessages.push(item);
  }

  // Everything was stored as a JSON string, so turn it back into objects.
  // (Depending on the client version a value may already arrive parsed,
  // so we only JSON.parse the ones that are still strings.)
  const messages = rawMessages
    .map((raw) => {
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      }
      return raw;
    })
    .filter((msg) => msg !== null);

  // Note: the joiner does not need a "peer-joined" message here - a
  // successful POST /api/join-room response already tells them they are in.
  // Only the creator's inbox ever receives a { type: "peer-joined" } message.
  return NextResponse.json({ messages });
}
