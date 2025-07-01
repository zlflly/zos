# Token TTL Migration

## Overview
This migration updates existing authentication tokens and user records in Redis:
- Token TTL: 30 days → 90 days
- Grace Period: 7 days → 365 days (1 year)
- User Records: Expire after 30 days → Persist forever

## Running the Migration

### Prerequisites
You need the Redis connection credentials:
```bash
export REDIS_KV_REST_API_URL="your-redis-url"
export REDIS_KV_REST_API_TOKEN="your-redis-token"
```

### Execute the Migration
```bash
node scripts/migrate-token-ttls.js
```

## What the Migration Does

1. **Active Tokens** (`chat:token:{username}`)
   - Extends TTL by approximately 60 days
   - Ensures maximum TTL doesn't exceed 90 days

2. **Last Tokens** (`chat:token:last:{username}`)
   - Used for grace period authentication
   - Extends TTL by approximately 358 days
   - Ensures maximum TTL doesn't exceed 455 days (90 + 365)

3. **User Records** (`chat:users:{username}`)
   - Removes TTL completely using Redis PERSIST command
   - User records now persist forever

## Automatic TTL Updates

After migration:
- Token TTLs are refreshed to 90 days when users authenticate
- User records no longer have TTL - they persist forever
- This happens in both `/api/chat.ts` and `/api/chat-rooms.js`
- No further manual intervention needed

## Safety Notes

- The script only updates keys that already have a TTL set
- Keys without expiration (TTL = -1) are not modified
- The script extends existing TTLs proportionally
- Maximum TTLs are capped to prevent excessive values

## Verification

To verify the migration worked:
1. Check a sample of tokens in Redis - should have TTL around 7,776,000 seconds (90 days)
2. Check last tokens - should have TTLs around 39,312,000 seconds (455 days)
3. Check user records - should have TTL of -1 (no expiration)