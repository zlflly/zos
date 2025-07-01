import { Redis } from "@upstash/redis";
import { Filter } from "bad-words";
import Pusher from "pusher";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// Initialize profanity filter with custom placeholder
const filter = new Filter({ placeHolder: "█" });

// Add additional words to the blacklist
filter.addWords("badword1", "badword2", "inappropriate");

// Set up Redis client
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// Logging utilities
const logRequest = (method, url, action, id) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id, message, data) => {
  console.log(`[${id}] INFO: ${message}`, data ? data : "");
};

const logError = (id, message, error) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 10);
};

// API runtime config
export const runtime = "nodejs";
export const maxDuration = 15;

// Redis key prefixes
const CHAT_ROOM_PREFIX = "chat:room:";
const CHAT_MESSAGES_PREFIX = "chat:messages:";
const CHAT_USERS_PREFIX = "chat:users:";
const CHAT_ROOM_USERS_PREFIX = "chat:room:users:";
const CHAT_ROOM_PRESENCE_PREFIX = "chat:presence:"; // New: for tracking user presence in rooms with TTL

// TOKEN TTL (in seconds) – tokens expire after 90 days
const USER_TTL_SECONDS = 7776000; // 90 days (kept for token expiry)

// Token expiration time in seconds (90 days)
const USER_EXPIRATION_TIME = 7776000; // 90 days

// Note: User records no longer expire - they persist forever

// Room presence TTL (in seconds) – after this period of inactivity, user is considered offline in room
const ROOM_PRESENCE_TTL_SECONDS = 86400; // 1 day (24 hours)

// Add constants for max message and username length
const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 30;
const MIN_USERNAME_LENGTH = 3; // Minimum username length (must be more than 2 characters)

// Token constants
const AUTH_TOKEN_PREFIX = "chat:token:";
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits
const TOKEN_GRACE_PERIOD = 86400 * 365; // 365 days (1 year) grace period for refresh after expiry

// Password constants
const PASSWORD_HASH_PREFIX = "chat:password:";
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_BCRYPT_ROUNDS = 10;

// Rate limiting constants
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
const RATE_LIMIT_ATTEMPTS = 10; // Max attempts per window
const RATE_LIMIT_PREFIX = "rl:"; // Rate limit key prefix

// ------------------------------
// Input-validation / sanitization helpers
// ------------------------------

// Usernames: 3-30 characters, letters, numbers, underscore or hyphen
const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/i;

// Room IDs generated internally are base-36 alphanumerics; still validate when received from client
const ROOM_ID_REGEX = /^[a-z0-9]+$/i;

/** Simple HTML-escaping to mitigate XSS when rendering messages */
const escapeHTML = (str = "") =>
  str.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch])
  );

/** Validate a username string. Throws on failure. */
function assertValidUsername(username, requestId) {
  if (!USERNAME_REGEX.test(username)) {
    logInfo(
      requestId,
      `Invalid username format: ${username}. Must match ${USERNAME_REGEX}`
    );
    throw new Error("Invalid username format");
  }
}

/** Validate a roomId string. Throws on failure. */
function assertValidRoomId(roomId, requestId) {
  if (!ROOM_ID_REGEX.test(roomId)) {
    logInfo(
      requestId,
      `Invalid roomId format: ${roomId}. Must match ${ROOM_ID_REGEX}`
    );
    throw new Error("Invalid room ID format");
  }
}

/**
 * Hash a password using bcrypt
 * @param {string} password - The plaintext password
 * @returns {Promise<string>} - The hashed password
 */
const hashPassword = async (password) => {
  return await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
};

/**
 * Verify a password against a hash
 * @param {string} password - The plaintext password
 * @param {string} hash - The bcrypt hash
 * @returns {Promise<boolean>} - Whether the password matches
 */
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Set or update a user's password hash
 * @param {string} username - The username
 * @param {string} passwordHash - The bcrypt hash
 */
const setUserPasswordHash = async (username, passwordHash) => {
  const passwordKey = `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
  await redis.set(passwordKey, passwordHash);
};

/**
 * Get a user's password hash
 * @param {string} username - The username
 * @returns {Promise<string|null>} - The password hash or null if not set
 */
const getUserPasswordHash = async (username) => {
  const passwordKey = `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
  return await redis.get(passwordKey);
};

/**
 * TOKEN ARCHITECTURE:
 *
 * 1. Token Generation:
 *    - Users can generate a token via /api/chat-rooms?action=generateToken
 *    - Tokens have the same TTL as users (90 days)
 *    - Only one active token per user (unless force=true is used)
 *
 * 2. Token Refresh:
 *    - Users can refresh tokens via /api/chat-rooms?action=refreshToken
 *    - Requires the old token (even if expired) for validation
 *    - Expired tokens can be used for refresh within a 365-day (1 year) grace period
 *    - When refreshing, the old token is stored for future grace period use
 *
 * 3. Token Storage:
 *    - Active tokens: "chat:token:{username}" with 90-day TTL
 *    - Last valid tokens: "chat:token:last:{username}" for grace period refresh
 *    - Last valid tokens are stored with extended TTL (455 days total - 90 days + 365 days grace)
 *
 * 4. Authentication Flow:
 *    - Most endpoints require Bearer token in Authorization header
 *    - Username must be provided in X-Username header
 *    - Token validation refreshes the token TTL on each successful auth
 *
 * 5. Grace Period:
 *    - After a token expires, users have 365 days (1 year) to refresh using the expired token
 *    - This prevents users from being permanently locked out
 *    - The grace period token data includes when the original token expired
 */

/**
 * Generate a secure authentication token
 */
const generateAuthToken = () => {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
};

/**
 * Validate authentication for a request
 * @param {string} username - The username to validate
 * @param {string} token - The authentication token
 * @param {string} requestId - Request ID for logging
 * @param {boolean} allowExpired - Whether to allow recently expired tokens (for refresh)
 * @returns {Promise<{valid: boolean, expired?: boolean}>} - Validation result
 */
const validateAuth = async (
  username,
  token,
  requestId,
  allowExpired = false
) => {
  if (!username || !token) {
    logInfo(requestId, "Auth validation failed: Missing username or token");
    return { valid: false };
  }

  const tokenKey = `${AUTH_TOKEN_PREFIX}${username.toLowerCase()}`;
  const storedToken = await redis.get(tokenKey);

  if (!storedToken) {
    if (allowExpired) {
      // Check if we have a record of this token being recently used
      // We store the last valid token when it's refreshed
      const lastTokenKey = `${AUTH_TOKEN_PREFIX}last:${username.toLowerCase()}`;
      const lastTokenData = await redis.get(lastTokenKey);

      if (lastTokenData) {
        try {
          const { token: lastToken, expiredAt } = JSON.parse(lastTokenData);
          // Allow refresh within grace period (365 days after expiry)
          const gracePeriodEnd = expiredAt + TOKEN_GRACE_PERIOD * 1000;

          if (lastToken === token && Date.now() < gracePeriodEnd) {
            logInfo(
              requestId,
              `Auth validation: Found recently expired token for user ${username} within grace period`
            );
            return { valid: true, expired: true };
          }
        } catch (e) {
          logError(requestId, "Error parsing last token data", e);
        }
      }
    }

    logInfo(
      requestId,
      `Auth validation failed: No token found for user ${username}`
    );
    return { valid: false };
  }

  // Perform timing-safe comparison
  try {
    const a = Buffer.from(storedToken);
    const b = Buffer.from(token);
    // Length check must pass before timingSafeEqual
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      logInfo(
        requestId,
        `Auth validation failed: Invalid token for user ${username}`
      );
      return { valid: false };
    }
  } catch (cmpErr) {
    // Fallback (should not happen)
    if (storedToken !== token) {
      logInfo(
        requestId,
        `Auth validation failed (fallback): Invalid token for user ${username}`
      );
      return { valid: false };
    }
  }

  // Refresh token expiration on successful validation
  await redis.expire(tokenKey, USER_TTL_SECONDS);
  return { valid: true, expired: false };
};

/**
 * Store the last valid token when refreshing
 */
const storeLastValidToken = async (username, token) => {
  const lastTokenKey = `${AUTH_TOKEN_PREFIX}last:${username.toLowerCase()}`;
  const tokenData = {
    token,
    expiredAt: Date.now() + USER_EXPIRATION_TIME * 1000, // When the current token will expire
  };
  // Store with extended TTL to cover grace period
  await redis.set(lastTokenKey, JSON.stringify(tokenData), {
    ex: USER_EXPIRATION_TIME + TOKEN_GRACE_PERIOD,
  });
};

/**
 * Extract authentication from request headers
 * @param {Request} request - The incoming request
 * @returns {{ username: string | null, token: string | null }}
 */
const extractAuth = (request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = request.headers.get("x-username");

  return { username, token };
};

/**
 * Helper to set (or update) a user record WITHOUT expiry.
 * User records now persist forever.
 */
const setUser = async (username, data) => {
  await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(data));
};

/**
 * Set user presence in a room with automatic expiration.
 * This tracks that a user is "online" in a specific room.
 */
const setRoomPresence = async (roomId, username) => {
  const presenceKey = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:${username}`;
  await redis.set(presenceKey, getCurrentTimestamp(), {
    ex: ROOM_PRESENCE_TTL_SECONDS,
  });
};

/**
 * Refresh user presence in a room (extend the TTL).
 */
const refreshRoomPresence = async (roomId, username) => {
  const presenceKey = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:${username}`;
  // Only refresh if the key exists (user is currently present)
  const exists = await redis.exists(presenceKey);
  if (exists) {
    await redis.expire(presenceKey, ROOM_PRESENCE_TTL_SECONDS);
  }
};

/**
 * Get all users currently present in a room (based on presence TTL).
 * This replaces the old logic that relied on sets + user existence.
 */
const getActiveUsersInRoom = async (roomId) => {
  const pattern = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:*`;
  const users = [];
  let cursor = 0;

  // Use SCAN to iterate through presence keys
  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100, // Process 100 keys at a time
    });

    cursor = parseInt(newCursor);

    // Extract usernames from the keys
    const userBatch = keys.map((key) => {
      const parts = key.split(":");
      return parts[parts.length - 1]; // Last part is the username
    });

    users.push(...userBatch);
  } while (cursor !== 0);

  return users;
};

/**
 * Returns the list of active usernames in a room (based on presence TTL).
 * This uses the new presence-based system instead of relying on user existence.
 * Also cleans up the old room user sets for backward compatibility.
 */
const getActiveUsersAndPrune = async (roomId) => {
  // Get users based on presence (new system)
  const activeUsers = await getActiveUsersInRoom(roomId);

  // For backward compatibility, also clean up the old room user sets
  // This can be removed after a migration period
  const roomUsersKey = `${CHAT_ROOM_USERS_PREFIX}${roomId}`;
  const oldSetMembers = await redis.smembers(roomUsersKey);

  if (oldSetMembers.length > 0) {
    // Remove all members from the old set since we're now using presence-based tracking
    await redis.del(roomUsersKey);
  }

  return activeUsers;
};

/**
 * Clean up expired presence entries and update room counts.
 * This can be called periodically to ensure accurate presence counts.
 */
const cleanupExpiredPresence = async () => {
  try {
    // Get all room keys using SCAN
    const roomKeys = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_PREFIX}*`,
        count: 100, // Process 100 keys at a time
      });

      cursor = parseInt(newCursor);
      roomKeys.push(...keys);
    } while (cursor !== 0);

    for (const roomKey of roomKeys) {
      const roomId = roomKey.substring(CHAT_ROOM_PREFIX.length);
      const newCount = await refreshRoomUserCount(roomId);
      console.log(
        `[cleanupExpiredPresence] Updated room ${roomId} count to ${newCount}`
      );
    }

    return { success: true, roomsUpdated: roomKeys.length };
  } catch (error) {
    console.error("[cleanupExpiredPresence] Error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Re-calculates the active user count for a room, updates the stored room
 * object and returns the fresh count.
 */
const refreshRoomUserCount = async (roomId) => {
  const activeUsers = await getActiveUsersAndPrune(roomId);
  const userCount = activeUsers.length;

  const roomKey = `${CHAT_ROOM_PREFIX}${roomId}`;
  const roomDataRaw = await redis.get(roomKey);
  const roomData =
    typeof roomDataRaw === "string"
      ? (() => {
          try {
            return JSON.parse(roomDataRaw);
          } catch {
            return null;
          }
        })()
      : roomDataRaw;
  if (roomData) {
    const updatedRoom = { ...roomData, userCount };
    await redis.set(roomKey, updatedRoom);
  }

  return userCount;
};

// Add helper to fetch rooms with user list
async function getDetailedRooms() {
  const rooms = [];
  let cursor = 0;

  // Use SCAN to iterate through room keys
  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: `${CHAT_ROOM_PREFIX}*`,
      count: 100, // Process 100 keys at a time
    });

    cursor = parseInt(newCursor);

    if (keys.length > 0) {
      const roomsData = await redis.mget(...keys);
      const roomBatch = await Promise.all(
        roomsData.map(async (raw, index) => {
          if (!raw) return null;
          const roomObj = typeof raw === "string" ? JSON.parse(raw) : raw;
          const activeUsers = await getActiveUsersAndPrune(roomObj.id);
          return {
            ...roomObj,
            userCount: activeUsers.length,
            users: activeUsers,
          };
        })
      );
      rooms.push(...roomBatch.filter((r) => r !== null));
    }
  } while (cursor !== 0);

  return rooms;
}

// Helper functions
const generateId = () => {
  // 128-bit random identifier encoded as hex (32 chars)
  return crypto.randomBytes(16).toString("hex");
};

const getCurrentTimestamp = () => {
  return Date.now();
};

// Error response helper
const createErrorResponse = (message, status) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

// Utility to ensure user data is an object
const parseUserData = (data) => {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data; // Already object
};

// Helper function to ensure user exists or create them
async function ensureUserExists(username, requestId) {
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  // Check for profanity first
  if (filter.isProfane(username)) {
    logInfo(
      requestId,
      `User check failed: Username contains inappropriate language: ${username}`
    );
    throw new Error("Username contains inappropriate language");
  }

  // Check minimum username length
  if (username.length < MIN_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User check failed: Username too short: ${username.length} chars (min: ${MIN_USERNAME_LENGTH})`
    );
    throw new Error(
      `Username must be at least ${MIN_USERNAME_LENGTH} characters`
    );
  }

  // Check maximum username length
  if (username.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User check failed: Username too long: ${username.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    throw new Error(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`
    );
  }

  // Validate allowed characters
  if (!USERNAME_REGEX.test(username)) {
    logInfo(
      requestId,
      `User check failed: Invalid username format: ${username}`
    );
    throw new Error("Invalid username format");
  }

  // Attempt to get existing user
  let userData = await redis.get(userKey);
  if (userData) {
    logInfo(requestId, `User ${username} exists.`);
    return parseUserData(userData);
  }

  // User doesn't exist, attempt atomic creation
  logInfo(requestId, `User ${username} not found. Attempting creation.`);
  const newUser = {
    username,
    lastActive: getCurrentTimestamp(),
  };
  const created = await redis.setnx(userKey, JSON.stringify(newUser));

  if (created) {
    logInfo(requestId, `User ${username} created successfully.`);
    return newUser;
  } else {
    // Race condition: User was created between GET and SETNX. Fetch the existing user.
    logInfo(
      requestId,
      `User ${username} created concurrently. Fetching existing data.`
    );
    userData = await redis.get(userKey);
    if (userData) {
      return parseUserData(userData);
    } else {
      // Should be rare, but handle case where user disappeared again
      logError(
        requestId,
        `User ${username} existed momentarily but is now gone. Race condition?`
      );
      throw new Error("Failed to ensure user existence due to race condition.");
    }
  }
}

// GET handler
export async function GET(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("GET", request.url, action, requestId);

  try {
    // Actions that don't require authentication
    const publicActions = [
      "getRooms",
      "getMessages",
      "getBulkMessages",
      "getUsers",
    ];

    // Check authentication for protected actions
    if (!publicActions.includes(action)) {
      const { username, token } = extractAuth(request);

      // Special handling for checkPassword - it's a protected action
      if (action === "checkPassword") {
        // Validate authentication
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid) {
          return createErrorResponse("Unauthorized", 401);
        }
        return await handleCheckPassword(username, requestId);
      }

      // Validate authentication for other protected actions
      const isValid = await validateAuth(username, token, requestId);
      if (!isValid.valid) {
        return createErrorResponse("Unauthorized", 401);
      }
    }

    switch (action) {
      case "getRooms":
        return await handleGetRooms(request, requestId);
      case "getRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        return await handleGetRoom(roomId, requestId);
      }
      case "getMessages": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        return await handleGetMessages(roomId, requestId);
      }
      case "getBulkMessages": {
        const roomIdsParam = url.searchParams.get("roomIds");
        if (!roomIdsParam) {
          logInfo(requestId, "Missing roomIds parameter");
          return createErrorResponse(
            "roomIds query parameter is required",
            400
          );
        }
        // Parse comma-separated string into array
        const roomIds = roomIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        if (roomIds.length === 0) {
          logInfo(requestId, "No valid room IDs provided");
          return createErrorResponse("At least one room ID is required", 400);
        }
        return await handleGetBulkMessages(roomIds, requestId);
      }
      case "getRoomUsers": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter for getRoomUsers");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        const users = await getActiveUsersAndPrune(roomId);
        return new Response(JSON.stringify({ users }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      case "getUsers":
        const searchQuery = url.searchParams.get("search") || "";
        return await handleGetUsers(requestId, searchQuery);
      case "cleanupPresence": {
        // This is an admin-only endpoint for cleaning up expired presence
        const { username, token } = extractAuth(request);
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid || username?.toLowerCase() !== "ryo") {
          return createErrorResponse(
            "Unauthorized - Admin access required",
            403
          );
        }

        const result = await cleanupExpiredPresence();
        if (result.success) {
          // Broadcast updated room counts
          await broadcastRoomsUpdated();
        }
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }
      case "debugPresence": {
        // Debug endpoint to check presence state
        const { username, token } = extractAuth(request);
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid || username?.toLowerCase() !== "ryo") {
          return createErrorResponse(
            "Unauthorized - Admin access required",
            403
          );
        }

        try {
          // Get all presence keys using SCAN
          const presenceKeys = [];
          let cursor = 0;

          do {
            const [newCursor, keys] = await redis.scan(cursor, {
              match: `${CHAT_ROOM_PRESENCE_PREFIX}*`,
              count: 100, // Process 100 keys at a time
            });

            cursor = parseInt(newCursor);
            presenceKeys.push(...keys);
          } while (cursor !== 0);

          const presenceData = {};

          for (const key of presenceKeys) {
            const value = await redis.get(key);
            const ttl = await redis.ttl(key);
            presenceData[key] = { value, ttl };
          }

          // Get all rooms and their calculated counts
          const rooms = await getDetailedRooms();

          return new Response(
            JSON.stringify({
              presenceKeys: presenceKeys.length,
              presenceData,
              rooms: rooms.map((r) => ({
                id: r.id,
                name: r.name,
                userCount: r.userCount,
                users: r.users,
              })),
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (error) {
          logError(requestId, "Error in debugPresence:", error);
          return createErrorResponse("Debug failed", 500);
        }
      }
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling GET request:", error);
    return createErrorResponse("Internal server error", 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// POST handler
export async function POST(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("POST", request.url, action, requestId);

  try {
    // Parse JSON body
    const body = await request.json();

    // ---------------- Rate limiting ----------------
    const sensitiveRateLimitActions = new Set([
      "generateToken",
      "refreshToken",
      "authenticateWithPassword",
      "setPassword",
      "createUser",
    ]);

    if (sensitiveRateLimitActions.has(action)) {
      // prefer username if available, else client IP
      const identifier = (
        body.username ||
        request.headers.get("x-username") ||
        request.headers.get("x-forwarded-for") ||
        "anon"
      ).toLowerCase();
      const allowed = await checkRateLimit(action, identifier, requestId);
      if (!allowed) {
        return createErrorResponse("Too many requests, please slow down", 429);
      }
    }

    // Declare username and token at function level
    let username = null;
    let token = null;

    // Actions that don't require authentication
    const publicActions = [
      "createUser",
      "joinRoom",
      "leaveRoom",
      "switchRoom",
      "refreshToken",
      "authenticateWithPassword", // New: password-based auth
    ];

    // Actions that specifically require authentication
    const protectedActions = [
      "createRoom",
      "sendMessage",
      "clearAllMessages",
      "resetUserCounts",
      "verifyToken",
      "setPassword", // New: set password for existing user
      "generateToken", // Generating/reissuing tokens now requires authentication
    ];

    // Check authentication for protected actions
    if (protectedActions.includes(action)) {
      const authResult = extractAuth(request);
      username = authResult.username;
      token = authResult.token;

      // For actions that include username in body, validate it matches the auth header
      if (
        body.username &&
        body.username.toLowerCase() !== username?.toLowerCase()
      ) {
        const allowedRyoProxy =
          action === "sendMessage" &&
          body.username.toLowerCase() === "ryo" &&
          username; // any authenticated user may proxy as ryo

        if (!allowedRyoProxy) {
          logInfo(
            requestId,
            `Auth mismatch: body username (${body.username}) != auth username (${username})`
          );
          return createErrorResponse("Username mismatch", 401);
        }
      }

      // Validate authentication
      const isValid = await validateAuth(
        username || body.username,
        token,
        requestId
      );
      if (!isValid.valid) {
        return createErrorResponse("Unauthorized", 401);
      }
    }

    switch (action) {
      case "createRoom":
        // Pass authenticated username for admin validation
        return await handleCreateRoom(body, username, requestId);
      case "joinRoom":
        return await handleJoinRoom(body, requestId);
      case "leaveRoom":
        return await handleLeaveRoom(body, requestId);
      case "switchRoom":
        return await handleSwitchRoom(body, requestId);
      case "sendMessage":
        return await handleSendMessage(body, requestId);
      case "createUser":
        return await handleCreateUser(body, requestId);
      case "generateToken":
        return await handleGenerateToken(body, requestId);
      case "refreshToken":
        return await handleRefreshToken(body, requestId);
      case "clearAllMessages":
        // Pass authenticated username for admin validation
        return await handleClearAllMessages(username, requestId);
      case "resetUserCounts":
        // Pass authenticated username for admin validation
        return await handleResetUserCounts(username, requestId);
      case "verifyToken":
        return await handleVerifyToken(username, requestId);
      case "authenticateWithPassword":
        return await handleAuthenticateWithPassword(body, requestId);
      case "setPassword":
        return await handleSetPassword(body, username, requestId);
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling POST request:", error);
    return createErrorResponse("Internal server error", 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// DELETE handler
export async function DELETE(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("DELETE", request.url, action, requestId);

  try {
    // All DELETE actions require authentication
    const { username, token } = extractAuth(request);

    // Validate authentication
    const isValid = await validateAuth(username, token, requestId);
    if (!isValid.valid) {
      return createErrorResponse("Unauthorized", 401);
    }

    switch (action) {
      case "deleteRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        // Pass authenticated username to handleDeleteRoom for admin validation
        return await handleDeleteRoom(roomId, username, requestId);
      }
      case "deleteMessage": {
        const roomId = url.searchParams.get("roomId");
        const messageId = url.searchParams.get("messageId");
        if (!roomId || !messageId) {
          logInfo(requestId, "Missing roomId or messageId parameter");
          return createErrorResponse(
            "roomId and messageId query parameters are required",
            400
          );
        }
        // Pass authenticated username to handleDeleteMessage for admin validation
        return await handleDeleteMessage(
          roomId,
          messageId,
          username,
          requestId
        );
      }
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling DELETE request:", error);
    return createErrorResponse("Internal server error", 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// Room functions
async function handleGetRooms(request, requestId) {
  logInfo(requestId, "Fetching all rooms");
  try {
    // Extract username from request to filter private rooms
    const url = new URL(request.url);
    const username = url.searchParams.get("username")?.toLowerCase() || null;

    const allRooms = await getDetailedRooms();

    // Filter rooms based on visibility
    const visibleRooms = allRooms.filter((room) => {
      // Public rooms are visible to everyone
      if (!room.type || room.type === "public") {
        return true;
      }

      // Private rooms are only visible to members
      if (room.type === "private" && room.members && username) {
        return room.members.includes(username);
      }

      return false;
    });

    return new Response(JSON.stringify({ rooms: visibleRooms }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching rooms:", error);
    return createErrorResponse("Failed to fetch rooms", 500);
  }
}

async function handleGetRoom(roomId, requestId) {
  logInfo(requestId, `Fetching room: ${roomId}`);
  try {
    assertValidRoomId(roomId, requestId);
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    const roomObj =
      typeof roomRaw === "string"
        ? (() => {
            try {
              return JSON.parse(roomRaw);
            } catch {
              return null;
            }
          })()
        : roomRaw;

    if (!roomObj) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Refresh user count before returning
    const userCount = await refreshRoomUserCount(roomId);
    const room = { ...roomObj, userCount };

    return new Response(JSON.stringify({ room }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error fetching room ${roomId}:`, error);
    return createErrorResponse("Failed to fetch room", 500);
  }
}

async function handleCreateRoom(data, username, requestId) {
  const { name: originalName, type = "public", members = [] } = data;

  // Normalize username
  const normalizedUsername = username?.toLowerCase();

  // Validate room type
  if (!["public", "private"].includes(type)) {
    logInfo(requestId, "Room creation failed: Invalid room type");
    return createErrorResponse(
      "Invalid room type. Must be 'public' or 'private'",
      400
    );
  }

  // For public rooms, only admin can create
  if (type === "public") {
    if (!originalName) {
      logInfo(
        requestId,
        "Room creation failed: Name is required for public rooms"
      );
      return createErrorResponse("Room name is required for public rooms", 400);
    }

    if (normalizedUsername !== "ryo") {
      logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
      return createErrorResponse(
        "Forbidden - Only admin can create public rooms",
        403
      );
    }

    // Check for profanity in room name
    if (filter.isProfane(originalName)) {
      logInfo(
        requestId,
        `Room creation failed: Name contains inappropriate language: ${originalName}`
      );
      return createErrorResponse(
        "Room name contains inappropriate language",
        400
      );
    }
  }

  // For private rooms, validate members
  if (type === "private") {
    if (!members || members.length === 0) {
      logInfo(
        requestId,
        "Room creation failed: Members are required for private rooms"
      );
      return createErrorResponse(
        "At least one member is required for private rooms",
        400
      );
    }

    // Ensure the creator is included in the members list
    const normalizedMembers = members.map((m) => m.toLowerCase());
    if (!normalizedMembers.includes(normalizedUsername)) {
      normalizedMembers.push(normalizedUsername);
    }
    members.length = 0;
    members.push(...normalizedMembers);
  }

  // Generate room name based on type
  let roomName;
  if (type === "public") {
    roomName = originalName.toLowerCase().replace(/ /g, "-");
  } else {
    // For private rooms, name is "@user1, @user2, ..."
    const sortedMembers = [...members].sort();
    roomName = sortedMembers.map((m) => `@${m}`).join(", ");
  }

  logInfo(requestId, `Creating ${type} room: ${roomName} by ${username}`);
  try {
    const roomId = generateId();
    const room = {
      id: roomId,
      name: roomName,
      type,
      createdAt: getCurrentTimestamp(),
      userCount: type === "private" ? members.length : 0,
      ...(type === "private" && { members }),
    };

    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, room);

    // For private rooms, set presence for all members
    if (type === "private") {
      const presencePromises = members.map((member) =>
        setRoomPresence(roomId, member)
      );
      await Promise.all(presencePromises);
    }

    logInfo(requestId, `${type} room created: ${roomId}`);

    // Trigger Pusher event for room creation
    try {
      await broadcastRoomsUpdated();
      logInfo(requestId, "Pusher event triggered: rooms-updated");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room creation:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block room creation
    }

    return new Response(JSON.stringify({ room }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating room ${roomName}:`, error);
    return createErrorResponse("Failed to create room", 500);
  }
}

async function handleDeleteRoom(roomId, username, requestId) {
  logInfo(requestId, `Deleting room: ${roomId}`);
  try {
    const roomDataRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomDataRaw) {
      logInfo(requestId, `Room not found for deletion: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Parse room data to check permissions
    const roomData =
      typeof roomDataRaw === "string" ? JSON.parse(roomDataRaw) : roomDataRaw;

    // Permission check based on room type
    if (roomData.type === "private") {
      // For private rooms, check if user is a member
      if (
        !roomData.members ||
        !roomData.members.includes(username.toLowerCase())
      ) {
        logInfo(
          requestId,
          `Unauthorized: User ${username} is not a member of private room ${roomId}`
        );
        return createErrorResponse(
          "Unauthorized - not a member of this room",
          403
        );
      }
    } else {
      // For public rooms, only admin can delete
      if (username.toLowerCase() !== "ryo") {
        logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
        return createErrorResponse(
          "Unauthorized - admin access required for public rooms",
          403
        );
      }
    }

    if (roomData.type === "private") {
      // For private rooms, implement "leave" behavior
      const updatedMembers = roomData.members.filter(
        (member) => member !== username.toLowerCase()
      );

      if (updatedMembers.length <= 1) {
        // Last member leaving OR only 1 member would remain - delete the entire room
        const pipeline = redis.pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);

        // Clean up all presence keys for this room
        const presencePattern = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:*`;
        const presenceKeys = [];
        let cursor = 0;

        do {
          const [newCursor, keys] = await redis.scan(cursor, {
            match: presencePattern,
            count: 100,
          });

          cursor = parseInt(newCursor);
          presenceKeys.push(...keys);
        } while (cursor !== 0);

        if (presenceKeys.length > 0) {
          presenceKeys.forEach((key) => pipeline.del(key));
        }

        await pipeline.exec();
        logInfo(
          requestId,
          `Private room deleted (${
            updatedMembers.length === 0
              ? "last member left"
              : "only 1 member would remain"
          }): ${roomId}`
        );
      } else {
        // Update room with remaining members (3+ members)
        const updatedRoom = {
          ...roomData,
          members: updatedMembers,
          userCount: updatedMembers.length,
        };
        await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, updatedRoom);

        // Remove user presence from room
        const presenceKey = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:${username.toLowerCase()}`;
        await redis.del(presenceKey);

        logInfo(
          requestId,
          `User ${username} left private room ${roomId}, ${updatedMembers.length} members remaining`
        );
      }
    } else {
      // For public rooms, delete entire room (admin only)
      const pipeline = redis.pipeline();
      pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
      pipeline.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
      pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);

      // Clean up all presence keys for this room
      const presencePattern = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:*`;
      const presenceKeys = [];
      let cursor = 0;

      do {
        const [newCursor, keys] = await redis.scan(cursor, {
          match: presencePattern,
          count: 100,
        });

        cursor = parseInt(newCursor);
        presenceKeys.push(...keys);
      } while (cursor !== 0);

      if (presenceKeys.length > 0) {
        presenceKeys.forEach((key) => pipeline.del(key));
      }

      await pipeline.exec();
      logInfo(requestId, `Public room deleted by admin: ${roomId}`);
    }

    // Trigger Pusher event for room changes
    try {
      await broadcastRoomsUpdated();
      logInfo(
        requestId,
        "Pusher event triggered: rooms-updated after room deletion/leave"
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room deletion/leave:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error deleting room ${roomId}:`, error);
    return createErrorResponse("Failed to delete room", 500);
  }
}

// Message functions
async function handleGetBulkMessages(roomIds, requestId) {
  logInfo(
    requestId,
    `Fetching messages for ${roomIds.length} rooms: ${roomIds.join(", ")}`
  );

  try {
    // Validate all room IDs
    for (const id of roomIds) {
      if (!ROOM_ID_REGEX.test(id)) {
        return createErrorResponse("Invalid room ID format", 400);
      }
    }

    // Verify all rooms exist first
    const roomExistenceChecks = await Promise.all(
      roomIds.map((roomId) => redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`))
    );

    const validRoomIds = roomIds.filter(
      (_, index) => roomExistenceChecks[index]
    );
    const invalidRoomIds = roomIds.filter(
      (_, index) => !roomExistenceChecks[index]
    );

    if (invalidRoomIds.length > 0) {
      logInfo(requestId, `Invalid room IDs: ${invalidRoomIds.join(", ")}`);
    }

    // Fetch messages for all valid rooms in parallel
    const messagePromises = validRoomIds.map(async (roomId) => {
      const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
      const messagesStrings = await redis.lrange(messagesKey, 0, 19); // Last 20 messages

      const messages = messagesStrings
        .map((item) => {
          try {
            if (typeof item === "object" && item !== null) {
              return item;
            } else if (typeof item === "string") {
              return JSON.parse(item);
            } else {
              return null;
            }
          } catch (e) {
            logError(requestId, `Failed to parse message for room ${roomId}:`, {
              item,
              error: e,
            });
            return null;
          }
        })
        .filter((message) => message !== null);

      return { roomId, messages };
    });

    const results = await Promise.all(messagePromises);

    // Convert to object map
    const messagesMap = {};
    results.forEach(({ roomId, messages }) => {
      messagesMap[roomId] = messages;
    });

    logInfo(
      requestId,
      `Successfully fetched messages for ${results.length} rooms`
    );

    return new Response(
      JSON.stringify({
        messagesMap,
        validRoomIds,
        invalidRoomIds,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error fetching bulk messages:", error);
    return createErrorResponse("Failed to fetch bulk messages", 500);
  }
}

async function handleGetMessages(roomId, requestId) {
  logInfo(requestId, `Fetching messages for room: ${roomId}`);

  try {
    assertValidRoomId(roomId, requestId);
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch only the last 10 messages (most recent)
    const messagesStrings = await redis.lrange(messagesKey, 0, 19);
    logInfo(
      requestId,
      `Retrieved ${messagesStrings.length} raw messages for room ${roomId}`
    );

    // Parse each message string/object
    const messages = messagesStrings
      .map((item) => {
        try {
          if (typeof item === "object" && item !== null) {
            // Already an object, assume it's ChatMessage
            return item;
          } else if (typeof item === "string") {
            // Item is a string, try parsing it
            const parsed = JSON.parse(item);
            return parsed;
          } else {
            // Unexpected type
            logInfo(
              requestId,
              `Unexpected item type in list for room ${roomId}:`,
              item
            );
            return null;
          }
        } catch (e) {
          logError(
            requestId,
            `Failed to process or parse item for room ${roomId}:`,
            { item, error: e }
          );
          return null;
        }
      })
      .filter((message) => message !== null);

    logInfo(
      requestId,
      `Processed ${messages.length} valid messages for room ${roomId}`
    );

    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error fetching messages for room ${roomId}:`, error);
    return createErrorResponse("Failed to fetch messages", 500);
  }
}

async function handleCreateUser(data, requestId) {
  const { username: originalUsername, password } = data;

  if (!originalUsername) {
    logInfo(requestId, "User creation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Check for profanity in username
  if (filter.isProfane(originalUsername)) {
    logInfo(
      requestId,
      `User creation failed: Username contains inappropriate language: ${originalUsername}`
    );
    return createErrorResponse("Username contains inappropriate language", 400);
  }

  // Check username length
  if (originalUsername.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Username too long: ${originalUsername.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    return createErrorResponse(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`,
      400
    );
  }

  // Check minimum username length
  if (originalUsername.length < MIN_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Username too short: ${originalUsername.length} chars (min: ${MIN_USERNAME_LENGTH})`
    );
    return createErrorResponse(
      `Username must be at least ${MIN_USERNAME_LENGTH} characters`,
      400
    );
  }

  // Validate password if provided
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Password too short: ${password.length} chars (min: ${PASSWORD_MIN_LENGTH})`
    );
    return createErrorResponse(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400
    );
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(
    requestId,
    `Creating user: ${username}${password ? " with password" : ""}`
  );
  try {
    // Check if username already exists using setnx for atomicity
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const user = {
      username, // Store the normalized lowercase username
      lastActive: getCurrentTimestamp(),
    };

    const created = await redis.setnx(userKey, JSON.stringify(user));

    if (!created) {
      // User already exists - attempt login if password provided
      if (password) {
        logInfo(
          requestId,
          `Username ${username} exists, attempting authentication with provided password`
        );

        try {
          // Get password hash for existing user
          const passwordHash = await getUserPasswordHash(username);

          if (passwordHash) {
            // Verify password
            const isValid = await verifyPassword(password, passwordHash);

            if (isValid) {
              // Password matches - log them in instead of throwing error
              logInfo(
                requestId,
                `Password correct for existing user ${username}, logging in`
              );

              // Generate authentication token
              const authToken = generateAuthToken();
              const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;

              // Store token with expiration
              await redis.set(tokenKey, authToken, {
                ex: USER_EXPIRATION_TIME,
              });

              // Get existing user data
              const existingUserData = await redis.get(userKey);
              const existingUser = existingUserData
                ? typeof existingUserData === "string"
                  ? JSON.parse(existingUserData)
                  : existingUserData
                : { username, lastActive: getCurrentTimestamp() };

              logInfo(
                requestId,
                `User ${username} authenticated via signup form with correct password`
              );

              return new Response(
                JSON.stringify({ user: existingUser, token: authToken }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
          }

          // Password doesn't match or no password hash found
          logInfo(
            requestId,
            `Authentication failed for existing user ${username} - incorrect password`
          );
        } catch (authError) {
          logError(
            requestId,
            `Error during authentication attempt for ${username}:`,
            authError
          );
        }
      }

      // No password provided or authentication failed - return original error
      logInfo(requestId, `Username already taken: ${username}`);
      return createErrorResponse("Username already taken", 409);
    }

    // Hash and store password if provided
    if (password) {
      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(username, passwordHash);
      logInfo(requestId, `Password hash stored for user: ${username}`);
    }

    // Generate authentication token
    const authToken = generateAuthToken();
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;

    // Store token with same expiration as user
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    logInfo(requestId, `User created with auth token: ${username}`);

    return new Response(JSON.stringify({ user, token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating user ${username}:`, error);
    return createErrorResponse("Failed to create user", 500);
  }
}

// Room membership functions
async function handleJoinRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, "Room join failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  try {
    assertValidUsername(username, requestId);
    assertValidRoomId(roomId, requestId);
  } catch (e) {
    return createErrorResponse(e.message, 400);
  }

  logInfo(requestId, `User ${username} joining room ${roomId}`);
  try {
    // Use Promise.all for concurrent checks
    const [roomData, userData] = await Promise.all([
      redis.get(`${CHAT_ROOM_PREFIX}${roomId}`),
      redis.get(`${CHAT_USERS_PREFIX}${username}`),
    ]);

    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    // Set user presence in room with TTL
    await setRoomPresence(roomId, username);

    // Update room user count based on presence
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom = { ...roomData, userCount };
    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, updatedRoom);
    logInfo(
      requestId,
      `User ${username} joined room ${roomId}, new user count: ${userCount}`
    );

    // Update user's last active timestamp
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, updatedUser);
    logInfo(requestId, `User ${username} last active time updated`);

    // Trigger optimized broadcast to update all clients with new room state
    try {
      await broadcastRoomsUpdated();
      logInfo(requestId, `Pusher event triggered: rooms-updated for user join`);
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room join:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block operation
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error joining room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to join room", 500);
  }
}

async function handleLeaveRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, "Room leave failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  try {
    assertValidUsername(username, requestId);
    assertValidRoomId(roomId, requestId);
  } catch (e) {
    return createErrorResponse(e.message, 400);
  }

  logInfo(requestId, `User ${username} leaving room ${roomId}`);
  try {
    // Check if room exists and parse data once
    const roomDataRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomDataRaw) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const roomObj =
      typeof roomDataRaw === "string" ? JSON.parse(roomDataRaw) : roomDataRaw;

    // Remove user presence from room
    const presenceKey = `${CHAT_ROOM_PRESENCE_PREFIX}${roomId}:${username}`;
    const removed = await redis.del(presenceKey);

    // If user was actually removed, update the count
    if (removed) {
      // Re-calculate active user count after possible pruning of stale users
      const previousUserCount = roomObj.userCount; // Get count before update
      const userCount = await refreshRoomUserCount(roomId);
      logInfo(
        requestId,
        `User ${username} left room ${roomId}, new active user count: ${userCount}`
      );

      // For private rooms, update the members list and delete if empty
      if (roomObj.type === "private") {
        // Update members list
        const updatedMembers = roomObj.members
          ? roomObj.members.filter((m) => m !== username)
          : [];

        if (updatedMembers.length <= 1) {
          // Delete the private room if no members left OR only 1 member would remain
          logInfo(
            requestId,
            `Deleting private room ${roomId} (${
              updatedMembers.length === 0
                ? "no members left"
                : "only 1 member would remain"
            })`
          );
          const pipeline = redis.pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          await pipeline.exec();

          // Trigger Pusher event for room deletion - only to affected members
          try {
            // For private room deletion, only notify the members who were in the room
            const affectedMembers = roomObj.members || [];
            await broadcastToSpecificUsers(affectedMembers);
            logInfo(
              requestId,
              `Pusher event triggered: rooms-updated to ${affectedMembers.length} affected members after private room deletion`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher event for room deletion:",
              pusherError
            );
          }
        } else {
          // Update the room with new members list (3+ members)
          const updatedRoom = {
            ...roomObj,
            members: updatedMembers,
            userCount,
          };
          await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, updatedRoom);

          // Trigger efficient Pusher event for room update
          try {
            // Use the optimized broadcast function instead of manual processing
            await broadcastRoomsUpdated();
            logInfo(
              requestId,
              `Pusher event triggered: rooms-updated for private room member update`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher event for room update:",
              pusherError
            );
          }
        }
      } else {
        // For public rooms, trigger efficient broadcast if user count changed
        if (userCount !== previousUserCount) {
          try {
            await broadcastRoomsUpdated();
            logInfo(
              requestId,
              `Pusher event triggered: rooms-updated for public room user count change`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher events for room leave:",
              pusherError
            );
            // Continue with response - Pusher error shouldn't block operation
          }
        } else {
          logInfo(
            requestId,
            `Skipping Pusher events: user count (${userCount}) did not change.`
          );
        }
      }
    } else {
      logInfo(requestId, `User ${username} was not in room ${roomId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error leaving room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to leave room", 500);
  }
}

// Function to clear all messages from all rooms
async function handleClearAllMessages(username, requestId) {
  logInfo(requestId, "Clearing all chat messages from all rooms");

  // Check if the user is the admin ("ryo")
  if (username?.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    // Get all message keys using SCAN
    const messageKeys = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_MESSAGES_PREFIX}*`,
        count: 100, // Process 100 keys at a time
      });

      cursor = parseInt(newCursor);
      messageKeys.push(...keys);
    } while (cursor !== 0);

    logInfo(
      requestId,
      `Found ${messageKeys.length} message collections to clear`
    );

    if (messageKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No messages to clear" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Delete all message keys
    const pipeline = redis.pipeline();
    messageKeys.forEach((key) => {
      pipeline.del(key);
    });
    await pipeline.exec();

    logInfo(
      requestId,
      `Successfully cleared messages from ${messageKeys.length} rooms`
    );

    // Notify clients that messages have been cleared
    try {
      await broadcastRoomsUpdated();
      logInfo(requestId, "Pusher event triggered: messages-cleared");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for message clearing:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared messages from ${messageKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error clearing all messages:", error);
    return createErrorResponse("Failed to clear messages", 500);
  }
}

// Function to reset all user counts in rooms and clear room user lists
async function handleResetUserCounts(username, requestId) {
  logInfo(requestId, "Resetting all user counts and clearing room memberships");

  // Check if the user is the admin ("ryo")
  if (username?.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    // Get all room keys using SCAN
    const roomKeys = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_PREFIX}*`,
        count: 100,
      });

      cursor = parseInt(newCursor);
      roomKeys.push(...keys);
    } while (cursor !== 0);

    logInfo(requestId, `Found ${roomKeys.length} rooms to update`);

    if (roomKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No rooms to update" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get all room user set keys (old system) using SCAN
    const roomUserKeys = [];
    cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_USERS_PREFIX}*`,
        count: 100,
      });

      cursor = parseInt(newCursor);
      roomUserKeys.push(...keys);
    } while (cursor !== 0);

    // Get all presence keys (new system) using SCAN
    const presenceKeys = [];
    cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_PRESENCE_PREFIX}*`,
        count: 100,
      });

      cursor = parseInt(newCursor);
      presenceKeys.push(...keys);
    } while (cursor !== 0);

    // Clear all room user sets and presence keys
    const deleteRoomUsersPipeline = redis.pipeline();
    roomUserKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    presenceKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    await deleteRoomUsersPipeline.exec();
    logInfo(
      requestId,
      `Cleared ${roomUserKeys.length} room user sets and ${presenceKeys.length} presence keys`
    );

    // Then update all room objects to set userCount to 0
    const roomsData = await redis.mget(...roomKeys);
    const updateRoomsPipeline = redis.pipeline();

    roomsData.forEach((roomData, index) => {
      if (roomData) {
        const room =
          typeof roomData === "object" ? roomData : JSON.parse(roomData);
        const updatedRoom = { ...room, userCount: 0 };
        updateRoomsPipeline.set(roomKeys[index], updatedRoom);
      }
    });

    await updateRoomsPipeline.exec();
    logInfo(requestId, `Reset user count to 0 for ${roomKeys.length} rooms`);

    // Notify clients that user counts have been reset
    try {
      await broadcastRoomsUpdated();
      logInfo(
        requestId,
        "Pusher event triggered: rooms-updated after user count reset"
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for user count reset:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset user counts for ${roomKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error resetting user counts:", error);
    return createErrorResponse("Failed to reset user counts", 500);
  }
}

// User functions
async function handleGetUsers(requestId, searchQuery = "") {
  logInfo(requestId, `Fetching users with search query: "${searchQuery}"`);
  try {
    // Only search if query is at least 2 characters
    if (searchQuery.length < 2) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const users = [];
    let cursor = 0;
    const maxResults = 20; // Limit results
    const pattern = `${CHAT_USERS_PREFIX}*${searchQuery.toLowerCase()}*`;

    // Use SCAN instead of KEYS to avoid performance issues
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100, // Scan 100 keys at a time
      });

      cursor = parseInt(newCursor);

      if (keys.length > 0) {
        const usersData = await redis.mget(...keys);
        const foundUsers = usersData
          .map((user) => {
            try {
              return typeof user === "string" ? JSON.parse(user) : user;
            } catch (e) {
              logError(requestId, "Error parsing user data:", e);
              return null;
            }
          })
          .filter(Boolean);

        users.push(...foundUsers);

        // Stop if we have enough results
        if (users.length >= maxResults) {
          break;
        }
      }
    } while (cursor !== 0 && users.length < maxResults);

    // Limit to maxResults
    const limitedUsers = users.slice(0, maxResults);

    logInfo(
      requestId,
      `Found ${limitedUsers.length} users matching "${searchQuery}"`
    );

    return new Response(JSON.stringify({ users: limitedUsers }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching users:", error);
    return createErrorResponse("Failed to fetch users", 500);
  }
}

async function handleSendMessage(data, requestId) {
  const { roomId, username: originalUsername, content: originalContent } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  // Validate identifiers early
  try {
    assertValidUsername(username, requestId);
    assertValidRoomId(roomId, requestId);
  } catch (e) {
    return createErrorResponse(e.message, 400);
  }

  if (!originalContent) {
    logInfo(requestId, "Message sending failed: Content is required", {
      roomId,
      username,
    });
    return createErrorResponse("Content is required", 400);
  }

  // Filter profanity then escape HTML to mitigate XSS
  const content = escapeHTML(filter.clean(originalContent));

  logInfo(requestId, `Sending message in room ${roomId} from user ${username}`);

  try {
    // Check if room exists
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Ensure user exists (or create if not) - This now handles profanity check for username
    let userData;
    try {
      userData = await ensureUserExists(username, requestId);
      if (!userData) {
        // Should not happen if ensureUserExists throws errors correctly
        logError(
          requestId,
          `Failed to ensure user ${username} exists, ensureUserExists returned falsy.`
        );
        return createErrorResponse("Failed to verify or create user", 500);
      }
    } catch (error) {
      logError(requestId, `Error ensuring user ${username} exists:`, error);
      if (error.message === "Username contains inappropriate language") {
        return createErrorResponse(
          "Username contains inappropriate language",
          400
        );
      }
      // Handle the rare race condition error specifically if needed, or just generic error
      if (error.message.includes("race condition")) {
        return createErrorResponse(
          "Failed to send message due to temporary issue, please try again.",
          500
        );
      }
      return createErrorResponse("Failed to verify or create user", 500);
    }

    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      logInfo(
        requestId,
        `Message too long from ${username}: length ${content.length}`
      );
      return createErrorResponse(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
        400
      );
    }

    // Fetch last message from this user in this room to prevent duplicates
    const lastMessagesRaw = await redis.lrange(
      `${CHAT_MESSAGES_PREFIX}${roomId}`,
      0,
      0
    ); // Most recent
    if (lastMessagesRaw.length > 0) {
      let lastMsgObj = null;
      const raw = lastMessagesRaw[0];

      if (typeof raw === "object" && raw !== null) {
        // Value is already a parsed object (legacy data that was stored without JSON.stringify)
        lastMsgObj = raw;
      } else if (typeof raw === "string") {
        try {
          lastMsgObj = JSON.parse(raw);
        } catch (e) {
          // Log but do not block sending – just skip duplicate check if unparsable
          logError(
            requestId,
            `Error parsing last message for duplicate check`,
            e
          );
        }
      }

      if (
        lastMsgObj &&
        lastMsgObj.username === username &&
        lastMsgObj.content === content
      ) {
        logInfo(requestId, `Duplicate message prevented from ${username}`);
        // Return 400 for duplicate
        return createErrorResponse("Duplicate message detected", 400);
      }
    }

    // Create and save the message
    const messageId = generateId();
    const message = {
      id: messageId,
      roomId,
      username,
      content,
      timestamp: getCurrentTimestamp(),
    };

    // Store message as stringified JSON in the list
    await redis.lpush(
      `${CHAT_MESSAGES_PREFIX}${roomId}`,
      JSON.stringify(message)
    );
    // Keep only the latest 100 messages per room
    await redis.ltrim(`${CHAT_MESSAGES_PREFIX}${roomId}`, 0, 99);
    logInfo(requestId, `Message saved with ID: ${message.id}`);

    // Update user's last active timestamp (userData is already parsed)
    // ensureUserExists already refreshed TTL, but updating lastActive is still correct
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(
      `${CHAT_USERS_PREFIX}${username}`,
      JSON.stringify(updatedUser)
    ); // Ensure it's stringified for Redis
    // Refresh expiration time again just to be safe upon activity
    await redis.expire(`${CHAT_USERS_PREFIX}${username}`, USER_EXPIRATION_TIME);

    // Refresh room presence when user sends a message
    await refreshRoomPresence(roomId, username);
    logInfo(
      requestId,
      `Updated user ${username} last active timestamp and reset expiration`
    );

    // Trigger Pusher event for new message on per-room channel
    try {
      const channelName = `room-${roomId}`;
      await pusher.trigger(channelName, "room-message", {
        roomId,
        message,
      });
      logInfo(
        requestId,
        `Pusher event triggered: room-message on ${channelName}`
      );

      // Fan-out to private room members as a fallback (personal channels)
      await fanOutToPrivateMembers(roomId, "room-message", { roomId, message });
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for new message:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block message sending
    }

    return new Response(JSON.stringify({ message }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Catch any unexpected errors from the main try block
    logError(
      requestId,
      `Unexpected error sending message in room ${roomId} from user ${username}:`,
      error
    );
    return createErrorResponse(
      "Failed to send message due to an internal error",
      500
    );
  }
}

async function handleDeleteMessage(roomId, messageId, username, requestId) {
  if (!roomId || !messageId) {
    logInfo(requestId, "Message deletion failed: Missing required fields", {
      roomId,
      messageId,
    });
    return createErrorResponse("Room ID and message ID are required", 400);
  }

  // Only admin user (ryo) can delete via this endpoint - use authenticated username
  if (username?.toLowerCase() !== "ryo") {
    logInfo(
      requestId,
      `Unauthorized delete attempt by authenticated user: ${username}`
    );
    return createErrorResponse("Forbidden", 403);
  }

  logInfo(
    requestId,
    `Deleting message ${messageId} from room ${roomId} by admin ${username}`
  );
  try {
    // Check if room exists
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const listKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch all messages
    const messagesRaw = await redis.lrange(listKey, 0, -1);
    let targetRaw = null;
    for (const raw of messagesRaw) {
      try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && obj.id === messageId) {
          targetRaw = raw;
          break;
        }
      } catch {
        // skip parse errors
      }
    }

    if (!targetRaw) {
      logInfo(requestId, `Message not found in list: ${messageId}`);
      return createErrorResponse("Message not found", 404);
    }

    // Remove the specific raw string from list
    await redis.lrem(listKey, 1, targetRaw);
    logInfo(requestId, `Message deleted: ${messageId}`);

    // Trigger Pusher event for message deletion on per-room channel
    try {
      const channelName = `room-${roomId}`;
      await pusher.trigger(channelName, "message-deleted", {
        roomId,
        messageId,
      });
      logInfo(
        requestId,
        `Pusher event triggered: message-deleted on ${channelName}`
      );

      await fanOutToPrivateMembers(roomId, "message-deleted", {
        roomId,
        messageId,
      });
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for message deletion:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block message deletion
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error deleting message ${messageId} from room ${roomId}:`,
      error
    );
    return createErrorResponse("Failed to delete message", 500);
  }
}

async function handleSwitchRoom(data, requestId) {
  const { previousRoomId, nextRoomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize username

  if (!username) {
    logInfo(requestId, "Room switch failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Validate room IDs format if provided
  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, requestId);
    if (nextRoomId) assertValidRoomId(nextRoomId, requestId);
  } catch (e) {
    return createErrorResponse(e.message, 400);
  }

  // Nothing to do if IDs are the same (including both null)
  if (previousRoomId === nextRoomId) {
    logInfo(
      requestId,
      `Room switch noop: previous and next are the same (${previousRoomId}).`
    );
    return new Response(JSON.stringify({ success: true, noop: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Ensure user exists (refreshes TTL)
    await ensureUserExists(username, requestId);

    const changedRooms = [];

    // --- LEAVE PREVIOUS ---
    if (previousRoomId) {
      const roomKey = `${CHAT_ROOM_PREFIX}${previousRoomId}`;
      const roomDataRaw = await redis.get(roomKey);

      if (roomDataRaw) {
        const roomData =
          typeof roomDataRaw === "string"
            ? JSON.parse(roomDataRaw)
            : roomDataRaw;
        // For public rooms, remove presence immediately when switching away
        // For private rooms, keep presence (they remain "online" until TTL expires)
        if (roomData.type !== "private") {
          // Remove presence for public rooms
          const presenceKey = `${CHAT_ROOM_PRESENCE_PREFIX}${previousRoomId}:${username}`;
          await redis.del(presenceKey);
          logInfo(
            requestId,
            `Removed presence for user ${username} from room ${previousRoomId}`
          );
          const userCount = await refreshRoomUserCount(previousRoomId);
          logInfo(
            requestId,
            `Updated user count for room ${previousRoomId}: ${userCount}`
          );
          changedRooms.push({ roomId: previousRoomId, userCount });
        } else {
          logInfo(
            requestId,
            `Keeping presence for private room ${previousRoomId} (will expire via TTL)`
          );
        }
      }
    }

    // --- JOIN NEXT ---
    if (nextRoomId) {
      const roomKey = `${CHAT_ROOM_PREFIX}${nextRoomId}`;
      const roomDataRaw = await redis.get(roomKey);
      if (!roomDataRaw) {
        logInfo(requestId, `Room not found while switching: ${nextRoomId}`);
        return createErrorResponse("Next room not found", 404);
      }

      // Set presence in the new room
      await setRoomPresence(nextRoomId, username);
      logInfo(
        requestId,
        `Set presence for user ${username} in room ${nextRoomId}`
      );
      const userCount = await refreshRoomUserCount(nextRoomId);
      logInfo(
        requestId,
        `Updated user count for room ${nextRoomId}: ${userCount}`
      );

      // Update room object with new count
      const roomData =
        typeof roomDataRaw === "string" ? JSON.parse(roomDataRaw) : roomDataRaw;
      await redis.set(roomKey, { ...roomData, userCount });

      // Update user's last active timestamp
      await redis.set(
        `${CHAT_USERS_PREFIX}${username}`,
        JSON.stringify({ username, lastActive: getCurrentTimestamp() })
      );

      changedRooms.push({ roomId: nextRoomId, userCount });
    }

    // Trigger Pusher events in batch
    try {
      for (const room of changedRooms) {
        // Removed individual user-count-updated event; rooms-updated will carry the new count
      }

      await broadcastRoomsUpdated();
    } catch (pusherErr) {
      logError(
        requestId,
        "Error triggering Pusher events in switchRoom:",
        pusherErr
      );
      // Non-fatal
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error during switchRoom:", error);
    return createErrorResponse("Failed to switch room", 500);
  }
}

async function handleGenerateToken(data, requestId) {
  const { username: originalUsername, force = false } = data;

  if (!originalUsername) {
    logInfo(requestId, "Token generation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(
    requestId,
    `Generating token for user: ${username}${force ? " (force mode)" : ""}`
  );
  try {
    // Check if user exists
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    // Check if token already exists
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;
    const existingToken = await redis.get(tokenKey);

    if (existingToken && !force) {
      logInfo(requestId, `Token already exists for user: ${username}`);
      return createErrorResponse("Token already exists for this user", 409);
    }

    // Generate new token
    const authToken = generateAuthToken();

    // Store token with expiration
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    logInfo(
      requestId,
      `Token ${
        existingToken && force ? "re-issued" : "generated"
      } successfully for user ${username}`
    );

    return new Response(JSON.stringify({ token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error generating token for user ${username}:`, error);
    return createErrorResponse("Failed to generate token", 500);
  }
}

async function handleRefreshToken(data, requestId) {
  const { username: originalUsername, oldToken } = data;

  if (!originalUsername || !oldToken) {
    logInfo(
      requestId,
      "Token refresh failed: Username and oldToken are required"
    );
    return createErrorResponse("Username and oldToken are required", 400);
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Refreshing token for user: ${username}`);
  try {
    // Check if user exists
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    // Validate the old token (allowing expired tokens)
    const validationResult = await validateAuth(
      username,
      oldToken,
      requestId,
      true
    );

    if (!validationResult.valid) {
      logInfo(requestId, `Invalid old token provided for user: ${username}`);
      return createErrorResponse("Invalid authentication token", 401);
    }

    // Store the old token for future grace period use (whether expired or not)
    await storeLastValidToken(username, oldToken);
    logInfo(
      requestId,
      `Stored old token for future grace period use for user: ${username}`
    );

    // Generate new token
    const authToken = generateAuthToken();

    // Store new token with expiration
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    logInfo(
      requestId,
      `Token refreshed successfully for user ${username} (was ${
        validationResult.expired ? "expired" : "valid"
      })`
    );

    return new Response(JSON.stringify({ token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error refreshing token for user ${username}:`, error);
    return createErrorResponse("Failed to refresh token", 500);
  }
}

async function handleVerifyToken(username, requestId) {
  logInfo(requestId, `Verifying token for user: ${username}`);

  try {
    // If we get here, the token has already been validated by the auth middleware
    // Just return success with user info
    return new Response(
      JSON.stringify({
        valid: true,
        username: username,
        message: "Token is valid",
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, `Error verifying token for user ${username}:`, error);
    return createErrorResponse("Failed to verify token", 500);
  }
}

// Helper: Filter visible rooms for a given username (or public if null)
const filterRoomsForUser = (rooms, username) => {
  if (!username) {
    return rooms.filter((room) => !room.type || room.type === "public");
  }
  const lower = username.toLowerCase();
  return rooms.filter((room) => {
    if (!room.type || room.type === "public") return true;
    if (room.type === "private" && room.members) {
      return room.members.includes(lower);
    }
    return false;
  });
};

/**
 * Broadcast a filtered rooms list to each active user as well as a public channel.
 * The public channel ("chats-public") only contains public rooms. Each user gets
 * their own channel: "chats-<username>".
 */
async function broadcastRoomsUpdated() {
  try {
    const allRooms = await getDetailedRooms();

    // 1. Public channel with only public rooms (for anonymous clients)
    const publicRooms = filterRoomsForUser(allRooms, null);
    const publicChannelPromise = pusher.trigger(
      "chats-public",
      "rooms-updated",
      {
        rooms: publicRooms,
      }
    );

    // 2. Per-user channels - get all user keys using SCAN
    const userKeys = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 100, // Process 100 keys at a time
      });

      cursor = parseInt(newCursor);
      userKeys.push(...keys);
    } while (cursor !== 0);

    // Parallelize the user channel broadcasts
    const userChannelPromises = userKeys.map((key) => {
      const username = key.substring(CHAT_USERS_PREFIX.length);
      const safeUsername = sanitizeForChannel(username);
      const userRooms = filterRoomsForUser(allRooms, username);
      return pusher.trigger(`chats-${safeUsername}`, "rooms-updated", {
        rooms: userRooms,
      });
    });

    // Wait for all Pusher calls to complete in parallel
    await Promise.all([publicChannelPromise, ...userChannelPromises]);
  } catch (err) {
    console.error("[broadcastRoomsUpdated] Failed to broadcast rooms:", err);
  }
}

// Helper: Broadcast an event to each member's personal channel for a private room
async function fanOutToPrivateMembers(roomId, eventName, payload) {
  try {
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomRaw) return;
    const roomObj = typeof roomRaw === "string" ? JSON.parse(roomRaw) : roomRaw;
    if (roomObj?.type !== "private" || !Array.isArray(roomObj.members)) return;

    await Promise.all(
      roomObj.members.map((member) => {
        const safe = sanitizeForChannel(member);
        return pusher.trigger(`chats-${safe}`, eventName, payload);
      })
    );
  } catch (err) {
    console.error(
      `[fanOutToPrivateMembers] Failed to fan-out ${eventName} for room ${roomId}:`,
      err
    );
  }
}

// Helper: sanitize strings for Pusher channel names
const sanitizeForChannel = (name) => name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

// Helper: Broadcast rooms update to specific users only
async function broadcastToSpecificUsers(usernames) {
  if (!usernames || usernames.length === 0) return;

  try {
    // Fetch all rooms once
    const allRooms = await getDetailedRooms();

    // Send filtered rooms to each user in parallel
    const pushPromises = usernames.map((username) => {
      const safeUsername = sanitizeForChannel(username);
      const userRooms = filterRoomsForUser(allRooms, username);
      return pusher.trigger(`chats-${safeUsername}`, "rooms-updated", {
        rooms: userRooms,
      });
    });

    // Wait for all Pusher calls to complete in parallel
    await Promise.all(pushPromises);
  } catch (err) {
    console.error("[broadcastToSpecificUsers] Failed to broadcast:", err);
  }
}

// Add these new handler functions after the existing handlers

async function handleAuthenticateWithPassword(data, requestId) {
  const { username: originalUsername, password } = data;

  if (!originalUsername || !password) {
    logInfo(requestId, "Auth failed: Username and password are required");
    return createErrorResponse("Username and password are required", 400);
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Authenticating user with password: ${username}`);
  try {
    // Check if user exists
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    // Get password hash
    const passwordHash = await getUserPasswordHash(username);

    if (!passwordHash) {
      logInfo(requestId, `No password set for user: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, passwordHash);

    if (!isValid) {
      logInfo(requestId, `Invalid password for user: ${username}`);
      return createErrorResponse("Invalid username or password", 401);
    }

    // Generate new token
    const authToken = generateAuthToken();
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;

    // Store token with expiration
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    logInfo(
      requestId,
      `Password authentication successful for user ${username}`
    );

    return new Response(JSON.stringify({ token: authToken, username }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error authenticating user ${username}:`, error);
    return createErrorResponse("Failed to authenticate", 500);
  }
}

async function handleSetPassword(data, username, requestId) {
  const { password } = data;

  if (!password) {
    logInfo(requestId, "Set password failed: Password is required");
    return createErrorResponse("Password is required", 400);
  }

  // Validate password length
  if (password.length < PASSWORD_MIN_LENGTH) {
    logInfo(
      requestId,
      `Set password failed: Password too short: ${password.length} chars (min: ${PASSWORD_MIN_LENGTH})`
    );
    return createErrorResponse(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400
    );
  }

  logInfo(requestId, `Setting password for user: ${username}`);
  try {
    // Hash and store password
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(username, passwordHash);

    logInfo(requestId, `Password set successfully for user ${username}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error setting password for user ${username}:`, error);
    return createErrorResponse("Failed to set password", 500);
  }
}

async function handleCheckPassword(username, requestId) {
  logInfo(requestId, `Checking if password is set for user: ${username}`);

  try {
    const passwordHash = await getUserPasswordHash(username);
    const hasPassword = !!passwordHash;

    return new Response(
      JSON.stringify({
        hasPassword,
        username: username,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, `Error checking password for user ${username}:`, error);
    return createErrorResponse("Failed to check password status", 500);
  }
}

// ------------------------------
// Rate limiting helpers
// ------------------------------

/**
 * Check if an action from a specific identifier is rate limited
 * @param {string} action - The action being performed
 * @param {string} identifier - The identifier (username, IP, etc.)
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<boolean>} - Whether the action is allowed (true) or rate limited (false)
 */
const checkRateLimit = async (action, identifier, requestId) => {
  try {
    const key = `${RATE_LIMIT_PREFIX}${action}:${identifier}`;
    const current = await redis.get(key);

    if (!current) {
      // First request in window
      await redis.set(key, 1, { ex: RATE_LIMIT_WINDOW_SECONDS });
      return true;
    }

    const count = parseInt(current);
    if (count >= RATE_LIMIT_ATTEMPTS) {
      logInfo(
        requestId,
        `Rate limit exceeded for ${action} by ${identifier}: ${count} attempts`
      );
      return false;
    }

    // Increment counter
    await redis.incr(key);
    return true;
  } catch (error) {
    logError(
      requestId,
      `Rate limit check failed for ${action}:${identifier}`,
      error
    );
    // On error, allow the request (fail open)
    return true;
  }
};
