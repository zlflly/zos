import { Redis } from "@upstash/redis";

// Configuration
const USER_KEY_PREFIX = "chat:users:";
const USER_TTL_SECONDS = 604800; // 1 week
const SCAN_COUNT = 100; // Number of keys to fetch per SCAN command

// Initialize Redis client
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

async function updateUserTTLs() {
  if (
    !process.env.REDIS_KV_REST_API_URL ||
    !process.env.REDIS_KV_REST_API_TOKEN
  ) {
    console.error(
      "Error: REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN environment variables must be set."
    );
    process.exit(1);
  }

  console.log("Starting script to update user TTLs...");
  let cursor = "0";
  let keysProcessed = 0;
  let keysUpdated = 0;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${USER_KEY_PREFIX}*`,
        count: SCAN_COUNT,
      });
      cursor = nextCursor;

      if (keys.length > 0) {
        console.log(`Found ${keys.length} keys in this batch.`);
        const pipeline = redis.pipeline();
        const keysToUpdateInBatch = [];

        for (const key of keys) {
          const ttl = await redis.ttl(key);
          if (ttl === -1) {
            pipeline.expire(key, USER_TTL_SECONDS);
            keysToUpdateInBatch.push(key);
          }
        }

        if (keysToUpdateInBatch.length > 0) {
          await pipeline.exec();
          console.log(
            `Updated TTL for ${
              keysToUpdateInBatch.length
            } keys: ${keysToUpdateInBatch.join(", ")}`
          );
          keysUpdated += keysToUpdateInBatch.length;
        }
        keysProcessed += keys.length;
      }
    } while (cursor !== "0");

    console.log("\n--- Script Finished ---");
    console.log(`Total keys scanned matching pattern: ${keysProcessed}`);
    console.log(`Total keys updated with new TTL: ${keysUpdated}`);
  } catch (error) {
    console.error("\n--- Error during script execution ---");
    console.error(error);
    process.exit(1);
  }
}

updateUserTTLs();
