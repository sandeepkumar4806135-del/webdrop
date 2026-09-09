// POST /api/join-room
// A joiner calls this with a 4-digit code. If the room exists we drop a
// "peer-joined" message into the creator's queue (so the creator sees it on
// their next poll) and tell the joiner that the join worked.
import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { checkRateLimit, clientIp, readJsonBody } from "../../lib/rateLimit";

// Queues live for 10 minutes after their last message, just like rooms,
// so empty leftovers get cleaned up by Redis automatically.
const QUEUE_TTL_SECONDS = 600;

export async function POST(request: NextRequest) {
  // Create the Redis client from UPSTASH_REDIS_REST_URL / _TOKEN
  const redis = Redis.fromEnv();

  // Rate-limit join attempts per IP BEFORE doing any work, so an attacker
  // can't brute-force 4-digit codes: max 10 tries per 60 seconds per IP.
  const limited = await checkRateLimit(redis, clientIp(request), "join");
  if (limited) return limited;

  // Read the { code } that the joiner sent in the request body, enforcing a
  // max size so oversized payloads are rejected before any work is done.
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.reason === "too-large" ? "payload-too-large" : "bad-request" },
      { status: parsedBody.reason === "too-large" ? 413 : 400 },
    );
  }
  const body = parsedBody.data as { code?: unknown };
  const code = body.code as string | undefined;

  // Basic check: the code must be a 4-digit string like "3841"
  if (!code || !/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // If the room does not exist (never created, or already expired)
  // tell the joiner it was not found.
  const exists = await redis.exists(`room:${code}`);
  if (!exists) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Push a "peer-joined" message into the creator's queue. The creator is
  // polling that queue every ~1.2 seconds and will pick this up.
  const queue = `queue:${code}:toCreator`;
  await redis
    .pipeline()
    .rpush(queue, JSON.stringify({ type: "peer-joined" }))
    .expire(queue, QUEUE_TTL_SECONDS) // keep Redis tidy
    .exec();

  // The joiner treats this success response as their own "peer-joined",
  // so no message is needed in the joiner's queue for this.
  return NextResponse.json({ success: true });
}
