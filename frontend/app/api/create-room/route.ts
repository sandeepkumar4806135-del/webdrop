// POST /api/create-room
// Creates a new pairing room: generates a random 4-digit code, stores it in
// Redis for 10 minutes, and returns the code so the sender can show/QR it.
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// How long a room stays alive, in seconds (10 minutes).
// After that the key disappears from Redis by itself, so abandoned
// rooms never pile up.
const ROOM_TTL_SECONDS = 600;

export async function POST() {
  // Create the Redis client from the environment variables
  // UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
  // (Next.js loads these from frontend/.env.local automatically.)
  const redis = Redis.fromEnv();

  // Try a few times in case we randomly pick a code that is already in use.
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    // A random number between 1000 and 9999, as a string, e.g. "3841"
    const candidate = String(Math.floor(1000 + Math.random() * 9000));

    // redis.exists returns 1 if the key is already taken, 0 if it is free
    const taken = await redis.exists(`room:${candidate}`);
    if (!taken) {
      code = candidate;
      break;
    }
  }

  // Extremely unlikely (needs 10 collisions in a row), but handle it anyway
  if (!code) {
    return NextResponse.json({ error: "could-not-create" }, { status: 500 });
  }

  // Store the room with the "ex" (expire) option so Redis deletes it after
  // 10 minutes. We don't need to read this value again - we only check that
  // the key exists.
  await redis.set(`room:${code}`, JSON.stringify({ createdAt: Date.now() }), {
    ex: ROOM_TTL_SECONDS,
  });

  // The two message queues don't need to be created here: Redis creates a
  // list automatically the first time something is pushed onto it.
  //   queue:{code}:toCreator -> messages waiting for the creator to poll
  //   queue:{code}:toJoiner  -> messages waiting for the joiner to poll

  // Send the new code back to the sender
  return NextResponse.json({ code });
}
