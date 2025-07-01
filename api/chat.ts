import { streamText, smoothStream } from "ai";
import { geolocation } from "@vercel/functions";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "./utils/aiModels";
import {
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  DELIVERABLE_REQUIREMENTS,
} from "./utils/aiPrompts";
import { z } from "zod";
import { SUPPORTED_AI_MODELS } from "../src/types/aiModels";
import { appIds } from "../src/config/appIds";
import {
  checkAndIncrementAIMessageCount,
  AI_LIMIT_PER_5_HOURS,
} from "./utils/rate-limit";
import { Redis } from "@upstash/redis";

// Update SystemState type to match new store structure
interface SystemState {
  apps: {
    [appId: string]: {
      isOpen: boolean;
      isForeground?: boolean;
    };
  };
  username?: string | null;
  internetExplorer: {
    url: string;
    year: string;
    status: string;
    currentPageTitle: string | null;
    aiGeneratedHtml: string | null;
    /** Optional markdown form of the AI generated HTML to keep context compact */
    aiGeneratedMarkdown?: string | null;
  };
  video: {
    currentVideo: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
  };
  ipod?: {
    currentTrack: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
    currentLyrics?: {
      lines: Array<{
        startTimeMs: string;
        words: string;
      }>;
    } | null;
    /** Full library of tracks available in the iPod app */
    library?: Array<{
      id: string;
      title: string;
      artist?: string;
    }>;
  };
  textEdit?: {
    instances: Array<{
      instanceId: string;
      filePath: string | null;
      title: string;
      contentMarkdown?: string | null;
      hasUnsavedChanges: boolean;
    }>;
  };
  /** Local time information reported by the user's browser */
  userLocalTime?: {
    timeString: string;
    dateString: string;
    timeZone: string;
  };
  /** Geolocation info inferred from the incoming request (provided by Vercel). */
  requestGeo?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
  };
  runningApps?: {
    foreground: {
      instanceId: string;
      appId: string;
      title?: string;
    } | null;
    background: Array<{
      instanceId: string;
      appId: string;
      title?: string;
    }>;
    instanceWindowOrder: string[];
  };
  chatRoomContext?: {
    roomId: string;
    recentMessages: string;
    mentionedMessage: string;
  };
}

// Allowed origins for API requests
const ALLOWED_ORIGINS = new Set(["https://os.ryo.lu", "http://localhost:3000"]);

// Function to validate request origin
// Only allow explicit origins defined in ALLOWED_ORIGINS – no wildcard ports or IP fallbacks
const isValidOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
};

// Allow streaming responses up to 60 seconds
export const maxDuration = 80;
export const runtime = "edge";
export const edge = true;
export const stream = true;
export const config = {
  runtime: "edge",
};

// Unified static prompt with all instructions
const STATIC_SYSTEM_PROMPT = [
  ANSWER_STYLE_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  // Include delivery requirements after code generation instructions
  DELIVERABLE_REQUIREMENTS,
].join("\n");

const CACHE_CONTROL_OPTIONS = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
} as const;

const generateDynamicSystemPrompt = (systemState?: SystemState) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateString = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const ryoTimeZone = "America/Los_Angeles";

  if (!systemState) return "";

  let prompt = `<system_state>
## USER CONTEXT
Current User: ${systemState.username || "you"}

## TIME & LOCATION
Ryo Time: ${timeString} on ${dateString} (${ryoTimeZone})`;

  if (systemState.userLocalTime) {
    prompt += `
User Time: ${systemState.userLocalTime.timeString} on ${systemState.userLocalTime.dateString} (${systemState.userLocalTime.timeZone})`;
  }

  if (systemState.requestGeo) {
    const location = [
      systemState.requestGeo.city,
      systemState.requestGeo.country,
    ]
      .filter(Boolean)
      .join(", ");
    prompt += `
User Location: ${location} (inferred from IP, may be inaccurate)`;
  }

  // Applications Section
  prompt += `\n\n## RUNNING APPLICATIONS`;

  if (systemState.runningApps?.foreground) {
    const foregroundTitle = systemState.runningApps.foreground.title
      ? ` (${systemState.runningApps.foreground.title})`
      : "";
    prompt += `
Foreground: ${systemState.runningApps.foreground.appId}${foregroundTitle}`;
  } else {
    prompt += `
Foreground: None`;
  }

  if (
    systemState.runningApps?.background &&
    systemState.runningApps.background.length > 0
  ) {
    const backgroundApps = systemState.runningApps.background
      .map((inst) => inst.appId + (inst.title ? ` (${inst.title})` : ""))
      .join(", ");
    prompt += `
Background: ${backgroundApps}`;
  } else {
    prompt += `
Background: None`;
  }

  // Media Section
  let hasMedia = false;

  if (systemState.video.currentVideo && systemState.video.isPlaying) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const videoArtist = systemState.video.currentVideo.artist
      ? ` by ${systemState.video.currentVideo.artist}`
      : "";
    prompt += `
Video: ${systemState.video.currentVideo.title}${videoArtist} (Playing)`;
  }

  // Check if iPod app is open
  const hasOpenIpod =
    systemState.runningApps?.foreground?.appId === "ipod" ||
    systemState.runningApps?.background?.some((app) => app.appId === "ipod");

  if (hasOpenIpod && systemState.ipod?.currentTrack) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const playingStatus = systemState.ipod.isPlaying ? "Playing" : "Paused";
    const trackArtist = systemState.ipod.currentTrack.artist
      ? ` by ${systemState.ipod.currentTrack.artist}`
      : "";
    prompt += `
iPod: ${systemState.ipod.currentTrack.title}${trackArtist} (${playingStatus})`;

    if (systemState.ipod.currentLyrics?.lines) {
      prompt += `
Current Lyrics:
${systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n")}`;
    }
  }

  // iPod Library (only if app is open)
  if (
    hasOpenIpod &&
    systemState.ipod?.library &&
    systemState.ipod.library.length > 0
  ) {
    const songList = systemState.ipod.library
      .slice(0, 100) // limit to first 100 songs to avoid overly long prompts
      .map((t) => `${t.title}${t.artist ? ` - ${t.artist}` : ""}`)
      .join("; ");
    prompt += `\n\n## IPOD LIBRARY
Available Songs (${Math.min(systemState.ipod.library.length, 100)} of ${
      systemState.ipod.library.length
    } shown):
${songList}`;
  }

  // Browser Section
  const hasOpenInternetExplorer =
    systemState.runningApps?.foreground?.appId === "internet-explorer" ||
    systemState.runningApps?.background?.some(
      (app) => app.appId === "internet-explorer"
    );

  if (hasOpenInternetExplorer && systemState.internetExplorer.url) {
    prompt += `\n\n## INTERNET EXPLORER
URL: ${systemState.internetExplorer.url}
Time Travel Year: ${systemState.internetExplorer.year}`;

    if (systemState.internetExplorer.currentPageTitle) {
      prompt += `
Page Title: ${systemState.internetExplorer.currentPageTitle}`;
    }

    const htmlMd = systemState.internetExplorer.aiGeneratedMarkdown;
    if (htmlMd) {
      prompt += `
Page Content (Markdown):
${htmlMd}`;
    }
  }

  // TextEdit Section
  if (
    systemState.textEdit?.instances &&
    systemState.textEdit.instances.length > 0
  ) {
    prompt += `\n\n## TEXTEDIT DOCUMENTS (${systemState.textEdit.instances.length} open)`;

    systemState.textEdit.instances.forEach((instance, index) => {
      const unsavedMark = instance.hasUnsavedChanges ? " *" : "";
      prompt += `
${index + 1}. ${instance.title}${unsavedMark} (ID: ${instance.instanceId})`;

      if (instance.contentMarkdown) {
        // Limit content preview to avoid overly long prompts
        const preview =
          instance.contentMarkdown.length > 500
            ? instance.contentMarkdown.substring(0, 500) + "..."
            : instance.contentMarkdown;
        prompt += `
   Content:
   ${preview}`;
      }
    });
  }

  prompt += `\n</system_state>`;

  if (systemState.chatRoomContext) {
    prompt += `\n\n<chat_room_reply_instructions>
## CHAT ROOM CONTEXT
Room ID: ${systemState.chatRoomContext.roomId}
Your Role: Respond as 'ryo' in this IRC-style chat room
Response Style: Use extremely concise responses

Recent Conversation:
${systemState.chatRoomContext.recentMessages}

Mentioned Message: "${systemState.chatRoomContext.mentionedMessage}"
</chat_room_reply_instructions>`;
  }

  return prompt;
};

// Simplified prompt builder that always includes every instruction
const buildContextAwarePrompts = () => {
  const prompts = [STATIC_SYSTEM_PROMPT];
  const loadedSections = ["STATIC_SYSTEM_PROMPT"];
  return { prompts, loadedSections };
};

// Add Redis client for auth validation
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// Add auth validation function
const AUTH_TOKEN_PREFIX = "chat:token:";
const TOKEN_LAST_PREFIX = "chat:token:last:";
const USER_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days (for tokens only)
const TOKEN_GRACE_PERIOD = 365 * 24 * 60 * 60; // 365 days (1 year)

async function validateAuthToken(
  username: string | undefined | null,
  authToken: string | undefined | null
): Promise<{ valid: boolean; newToken?: string }> {
  if (!username || !authToken) {
    return { valid: false };
  }

  const normalizedUsername = username.toLowerCase();
  const tokenKey = `${AUTH_TOKEN_PREFIX}${normalizedUsername}`;
  const storedToken = await redis.get(tokenKey);

  // Check if current token is valid
  if (storedToken && storedToken === authToken) {
    // Refresh token expiration on successful validation (90 days)
    await redis.expire(tokenKey, USER_TTL_SECONDS);
    return { valid: true };
  }

  // Token not found or doesn't match - check if it's in grace period
  const lastTokenKey = `${TOKEN_LAST_PREFIX}${normalizedUsername}`;
  const lastTokenData = await redis.get(lastTokenKey);

  if (lastTokenData) {
    try {
      const { token: lastToken, expiredAt } = JSON.parse(
        lastTokenData as string
      );
      const gracePeriodEnd = expiredAt + TOKEN_GRACE_PERIOD * 1000;

      // Check if the provided token matches the last valid token and is within grace period
      if (lastToken === authToken && Date.now() < gracePeriodEnd) {
        console.log(
          `[Auth] Token in grace period for user ${username}, refreshing...`
        );

        // Generate new token using Web Crypto API (Edge Runtime compatible)
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const newToken = Array.from(tokenBytes, (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");

        // Store the old token for future grace period use
        await redis.set(
          lastTokenKey,
          JSON.stringify({
            token: authToken,
            expiredAt: Date.now() + USER_TTL_SECONDS * 1000,
          }),
          { ex: USER_TTL_SECONDS + TOKEN_GRACE_PERIOD }
        );

        // Store the new token
        await redis.set(tokenKey, newToken, { ex: USER_TTL_SECONDS });

        return { valid: true, newToken };
      }
    } catch (e) {
      console.error("[Auth] Error parsing last token data:", e);
    }
  }

  return { valid: false };
}

export default async function handler(req: Request) {
  // Check origin before processing request
  const origin = req.headers.get("origin");
  if (!isValidOrigin(origin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // At this point origin is guaranteed to be a valid string from ALLOWED_ORIGINS
  const validOrigin = origin as string;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": validOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Parse query string to get model parameter
    const url = new URL(req.url);
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // Renamed to allow mutation
      model: bodyModel = DEFAULT_MODEL,
    } = await req.json();

    // Use query parameter if available, otherwise use body parameter
    const model = queryModel || bodyModel;

    // Helper: prefix log lines with username (for easier tracing)
    const usernameForLogs = incomingSystemState?.username ?? "unknown";
    const log = (...args: unknown[]) =>
      console.log(`[User: ${usernameForLogs}]`, ...args);
    const logError = (...args: unknown[]) =>
      console.error(`[User: ${usernameForLogs}]`, ...args);

    // Get IP address for rate limiting anonymous users
    // For Vercel deployments, use x-vercel-forwarded-for (won't be overwritten by proxies)
    // For localhost, use a fixed identifier
    const isLocalhost = origin === "http://localhost:3000";
    let ip: string;

    if (isLocalhost) {
      // For localhost development, use a fixed identifier
      ip = "localhost-dev";
    } else {
      // For Vercel deployments, prefer x-vercel-forwarded-for which is more reliable
      ip =
        req.headers.get("x-vercel-forwarded-for") ||
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown-ip";
    }

    log(`Request origin: ${origin}, IP: ${ip}`);

    // Check rate limits
    const username = incomingSystemState?.username;
    const authToken = incomingSystemState?.authToken;

    // Validate authentication first
    const validationResult = await validateAuthToken(username, authToken);

    // If username is provided but auth is invalid, reject the request
    if (username && !validationResult.valid) {
      log(`Authentication failed for claimed user: ${username}`);
      return new Response(
        JSON.stringify({
          error: "authentication_failed",
          message: "Invalid or missing authentication token",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": validOrigin,
          },
        }
      );
    }

    // Use validated auth status for rate limiting
    const isAuthenticated = validationResult.valid;
    const identifier = isAuthenticated ? username!.toLowerCase() : `anon:${ip}`;

    // Only check rate limits for user messages (not system messages)
    const userMessages = messages.filter(
      (m: { role: string }) => m.role === "user"
    );
    if (userMessages.length > 0) {
      const rateLimitResult = await checkAndIncrementAIMessageCount(
        identifier,
        isAuthenticated,
        authToken
      );

      if (!rateLimitResult.allowed) {
        log(
          `Rate limit exceeded: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
        );

        const errorResponse = {
          error: "rate_limit_exceeded",
          isAuthenticated,
          count: rateLimitResult.count,
          limit: rateLimitResult.limit,
          message: `You've hit your limit of ${AI_LIMIT_PER_5_HOURS} messages in this 5-hour window. Please wait a few hours and try again.`,
        };

        return new Response(JSON.stringify(errorResponse), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": validOrigin,
          },
        });
      }

      log(
        `Rate limit check passed: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
      );
    }

    log(
      `Using model: ${model || DEFAULT_MODEL} (${
        queryModel ? "from query" : model ? "from body" : "using default"
      })`
    );

    if (!messages || !Array.isArray(messages)) {
      logError(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      return new Response("Invalid messages format", { status: 400 });
    }

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      logError(`400 Error: Unsupported model - ${model}`);
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    // --- Geolocation (available only on deployed environment) ---
    const geo = geolocation(req);

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: geo }
      : ({ requestGeo: geo } as SystemState);

    const selectedModel = getModelInstance(model as SupportedModel);

    // Build unified static prompts
    const { prompts: staticPrompts, loadedSections } =
      buildContextAwarePrompts();
    const staticSystemPrompt = staticPrompts.join("\n");

    // Log prompt optimization metrics with loaded sections
    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4; // rough estimate
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // -------------------------------------------------------------
    // System messages – first the LARGE static prompt (cached),
    // then the smaller dynamic prompt (not cached)
    // -------------------------------------------------------------

    // 1) Static system instructions – mark as cacheable so Anthropic
    // can reuse this costly prefix across calls (min-1024-token rule)
    const staticSystemMessage = {
      role: "system" as const,
      content: staticSystemPrompt,
      ...CACHE_CONTROL_OPTIONS, // { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
    };

    // 2) Dynamic, user-specific system state (don’t cache)
    const dynamicSystemMessage = {
      role: "system" as const,
      content: generateDynamicSystemPrompt(systemState),
    };

    // Merge all messages: static sys → dynamic sys → user/assistant turns
    const enrichedMessages = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...messages,
    ];

    // Log all messages right before model call (as per user preference)
    enrichedMessages.forEach((msg, index) => {
      log(
        `Message ${index} [${msg.role}]: ${String(msg.content).substring(
          0,
          100
        )}...`
      );
    });

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      tools: {
        launchApp: {
          description:
            "Launch an application in the ryOS interface when the user explicitly requests it. If the id is 'internet-explorer', you must provide BOTH a real 'url' and a 'year' for time-travel; otherwise provide neither.",
          parameters: z
            .object({
              id: z.enum(appIds).describe("The app id to launch"),
              url: z
                .string()
                .optional()
                .describe(
                  "For internet-explorer only: The URL to load in Internet Explorer. Omit https:// and www. from the URL."
                ),
              year: z
                .string()
                .optional()
                .describe(
                  "For internet-explorer only: The year for the Wayback Machine or AI generation. Allowed values: 'current', '1000 BC', '1 CE', '500', '800', '1000', '1200', '1400', '1600', '1700', '1800', years from 1900-1989, 1990-1995, any year from 1991 to current year-1, '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100', '2150', '2200', '2250', '2300', '2400', '2500', '2750', '3000'. Used only with Internet Explorer."
                )
                .refine(
                  (year) => {
                    if (year === undefined) return true; // Optional field is valid if not provided
                    // Check if it's 'current' or matches the specific allowed year formats
                    const allowedYearsRegex =
                      /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;
                    // Adjust the regex dynamically based on current year if needed, but for simplicity, using fixed ranges that cover the logic.
                    // The regex covers: 'current', specific BC/CE/early years, 1900-1989, 1990-1995, 1991-currentYear-1 (approximated by 1991-2029), future decades, and specific future years.
                    const currentYearNum = new Date().getFullYear();
                    if (/^\d{4}$/.test(year)) {
                      const numericYear = parseInt(year, 10);
                      // Allow years from 1991 up to currentYear - 1
                      if (numericYear >= 1991 && numericYear < currentYearNum) {
                        return true;
                      }
                    }
                    const isValidFormat = allowedYearsRegex.test(year);
                    return isValidFormat;
                  },
                  {
                    message:
                      "Invalid year format or value. Use 'current', a valid past year (e.g., '1995', '1000 BC'), or a valid future year (e.g., '2030', '3000'). Check allowed years.",
                  }
                ),
            })
            .refine(
              (data) => {
                // If id is 'internet-explorer', either both url and year must be provided, or neither should be.
                if (data.id === "internet-explorer") {
                  const urlProvided =
                    data.url !== undefined &&
                    data.url !== null &&
                    data.url !== "";
                  const yearProvided =
                    data.year !== undefined &&
                    data.year !== null &&
                    data.year !== "";
                  // Return true if (both provided) or (neither provided). Return false otherwise.
                  return (
                    (urlProvided && yearProvided) ||
                    (!urlProvided && !yearProvided)
                  );
                }
                // If id is not 'internet-explorer', url/year should not be provided.
                if (data.url !== undefined || data.year !== undefined) {
                  return false;
                }
                return true; // Valid otherwise
              },
              {
                message:
                  "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
              }
            ),
        },
        closeApp: {
          description:
            "Close an application in the ryOS interface—but only when the user explicitly asks you to close that specific app.",
          parameters: z.object({
            id: z.enum(appIds).describe("The app id to close"),
          }),
        },
        textEditSearchReplace: {
          description:
            "Search and replace text in a specific TextEdit document. You MUST always provide 'search', 'replace', and 'instanceId'. Set 'isRegex: true' ONLY if the user explicitly mentions using a regular expression. Use the instanceId from the system state (e.g., '15') to target a specific window.",
          parameters: z.object({
            search: z
              .string()
              .describe(
                "REQUIRED: The text or regular expression to search for"
              ),
            replace: z
              .string()
              .describe(
                "REQUIRED: The text that will replace each match of 'search'"
              ),
            isRegex: z
              .boolean()
              .optional()
              .describe(
                "Set to true if the 'search' field should be treated as a JavaScript regular expression (without flags). Defaults to false."
              ),
            instanceId: z
              .string()
              .describe(
                "REQUIRED: The specific TextEdit instance ID to modify (e.g., '15'). Get this from the system state TextEdit Windows list."
              ),
          }),
        },
        textEditInsertText: {
          description:
            "Insert plain text into a specific TextEdit document. You MUST always provide 'text' and 'instanceId'. Appends to the end by default; use position 'start' to prepend. Use the instanceId from the system state (e.g., '15') to target a specific window.",
          parameters: z.object({
            text: z.string().describe("REQUIRED: The text to insert"),
            position: z
              .enum(["start", "end"])
              .optional()
              .describe(
                "Where to insert the text: 'start' to prepend, 'end' to append. Default is 'end'."
              ),
            instanceId: z
              .string()
              .describe(
                "REQUIRED: The specific TextEdit instance ID to modify (e.g., '15'). Get this from the system state TextEdit Windows list."
              ),
          }),
        },
        textEditNewFile: {
          description:
            "Create a new blank document in a new TextEdit instance. Use when the user explicitly requests a new or untitled file.",
          parameters: z.object({
            title: z
              .string()
              .optional()
              .describe(
                "Optional title for the new TextEdit window. If not provided, defaults to 'Untitled'."
              ),
          }),
        },
        // Add iPod control tools
        ipodPlayPause: {
          description:
            "Play, pause, or toggle playback on the iPod app. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({
            action: z
              .enum(["play", "pause", "toggle"])
              .optional()
              .describe(
                "Playback action to perform. Defaults to 'toggle' if omitted."
              ),
          }),
        },
        ipodPlaySong: {
          description:
            "Play a specific song in the iPod app by matching id, title, or artist. At least one of the parameters must be provided. If the iPod app is not open, it will be launched automatically.",
          parameters: z
            .object({
              id: z
                .string()
                .optional()
                .describe("The YouTube video id of the song to play"),
              title: z
                .string()
                .optional()
                .describe("The title (or part of it) of the song to play"),
              artist: z
                .string()
                .optional()
                .describe(
                  "The artist name (or part of it) of the song to play"
                ),
            })
            .refine((data) => data.id || data.title || data.artist, {
              message:
                "Provide at least one of 'id', 'title', or 'artist' to identify the song.",
            }),
        },
        ipodAddAndPlaySong: {
          description:
            "Adds a song to the iPod library from a YouTube video ID or URL and plays it. Supports YouTube URLs (youtube.com/watch?v=, youtu.be/), video IDs, and share URLs (os.ryo.lu/ipod/:id). The system will automatically fetch title, artist, and album information. The iPod app will be launched if it's not already open.",
          parameters: z.object({
            id: z
              .string()
              .describe(
                "The YouTube video ID or any supported URL format (YouTube URL, os.ryo.lu/ipod/:id, etc.) of the song to add and play."
              ),
          }),
        },
        ipodNextTrack: {
          description:
            "Skip to the next track in the iPod app playlist. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({}),
        },
        ipodPreviousTrack: {
          description:
            "Skip to the previous track in the iPod app playlist. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({}),
        },
        // --- HTML generation & preview ---
        generateHtml: {
          description:
            "Generate an HTML snippet following the CODE_GENERATION_INSTRUCTIONS and render it in the chat. Provide the HTML markup as a single string in the 'html' field. Do NOT wrap it in markdown fences; the client will handle formatting.",
          parameters: z.object({
            html: z
              .string()
              .describe(
                "The HTML code to render. It should follow the guidelines in CODE_GENERATION_INSTRUCTIONS—omit <head>/<body> tags and include only the body contents."
              ),
          }),
        },
      },
      temperature: 0.7,
      maxTokens: 6000,
      toolCallStreaming: true,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    const response = result.toDataStreamResponse();

    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", validOrigin);

    // If token was refreshed, add it to response headers
    if (validationResult.newToken) {
      headers.set("X-New-Auth-Token", validationResult.newToken);
      headers.set("Access-Control-Expose-Headers", "X-New-Auth-Token");
      log(`Token refreshed for user ${username}, new token sent in headers`);
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    // Check if error is a SyntaxError (likely from parsing JSON)
    if (error instanceof SyntaxError) {
      console.error(`400 Error: Invalid JSON - ${error.message}`);
      return new Response(`Bad Request: Invalid JSON - ${error.message}`, {
        status: 400,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
