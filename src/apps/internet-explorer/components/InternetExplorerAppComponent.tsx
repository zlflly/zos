import {
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
  useMemo,
  CSSProperties,
} from "react";
import { AppProps, InternetExplorerInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { Input } from "@/components/ui/input";
import { InternetExplorerMenuBar } from "./InternetExplorerMenuBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, ArrowRight, History, Search, Share } from "lucide-react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { motion, AnimatePresence } from "framer-motion";
import { useAiGeneration } from "../hooks/useAiGeneration";
import {
  useInternetExplorerStore,
  DEFAULT_FAVORITES,
  ErrorResponse,
  LanguageOption,
  LocationOption,
  Favorite,
  isDirectPassthrough,
} from "@/stores/useInternetExplorerStore";
import FutureSettingsDialog from "@/components/dialogs/FutureSettingsDialog";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { track } from "@vercel/analytics";
import { useAppStore } from "@/stores/useAppStore";
import TimeMachineView from "./TimeMachineView";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { toast } from "sonner";

// Analytics event namespace for Internet Explorer events
export const IE_ANALYTICS = {
  NAVIGATION_START: "internet-explorer:navigation_start",
  NAVIGATION_ERROR: "internet-explorer:navigation_error",
  NAVIGATION_SUCCESS: "internet-explorer:navigation_success",
};

// Helper function to get language display name
const getLanguageDisplayName = (lang: LanguageOption): string => {
  const languageMap: Record<LanguageOption, string> = {
    auto: "Auto-detected",
    english: "English",
    chinese: "Chinese (Traditional)",
    japanese: "Japanese",
    korean: "Korean",
    french: "French",
    spanish: "Spanish",
    portuguese: "Portuguese",
    german: "German",
    sanskrit: "Sanskrit",
    latin: "Latin",
    alien: "Alien Language",
    ai_language: "AI Language",
    digital_being: "Digital Being Language",
  };
  return languageMap[lang] || "Auto-detected";
};

// Helper function to get location display name
const getLocationDisplayName = (loc: LocationOption): string => {
  const locationMap: Record<LocationOption, string> = {
    auto: "Auto-detected",
    united_states: "United States",
    china: "China",
    japan: "Japan",
    korea: "South Korea",
    france: "France",
    spain: "Spain",
    portugal: "Portugal",
    germany: "Germany",
    canada: "Canada",
    uk: "United Kingdom",
    india: "India",
    brazil: "Brazil",
    australia: "Australia",
    russia: "Russia",
  };
  return locationMap[loc] || "Auto-detected";
};

interface ErrorPageProps {
  title: string;
  primaryMessage: string;
  secondaryMessage?: string;
  suggestions: (string | ReactNode)[];
  details?: string;
  footerText: string;
  showGoBackButtonInSuggestions?: boolean;
  onGoBack: () => void;
  onRetry?: () => void;
}

function ErrorPage({
  title,
  primaryMessage,
  secondaryMessage,
  suggestions,
  details,
  footerText,
  showGoBackButtonInSuggestions = true,
  onGoBack,
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="p-6 font-geneva-12 text-sm h-full overflow-y-auto">
      <h1 className="text-lg mb-4 font-normal flex items-center">{title}</h1>

      <p className="mb-3">{primaryMessage}</p>
      {secondaryMessage && <p className="mb-3">{secondaryMessage}</p>}

      <div className="h-px bg-gray-300 my-5"></div>

      <p className="mb-3">Please try the following:</p>

      <ul className="list-disc pl-6 mb-5 space-y-2">
        {suggestions.map((suggestion, index) => (
          <li key={index}>
            {typeof suggestion === "string" && suggestion.includes("{hostname}")
              ? suggestion.split("{hostname}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href={`https://${details}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 underline"
                      >
                        {details}
                      </a>
                      {part}
                    </>
                  )
                )
              : typeof suggestion === "string" &&
                suggestion.includes("{backButton}") &&
                showGoBackButtonInSuggestions
              ? suggestion.split("{backButton}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href="#"
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onGoBack();
                        }}
                        className="text-red-600 underline"
                      >
                        Back
                      </a>
                      {part}
                    </>
                  )
                )
              : typeof suggestion === "string" &&
                suggestion.includes("{refreshButton}") &&
                onRetry
              ? suggestion.split("{refreshButton}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href="#"
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onRetry();
                        }}
                        className="text-red-600 underline"
                      >
                        Refresh
                      </a>
                      {part}
                    </>
                  )
                )
              : suggestion}
          </li>
        ))}
      </ul>

      {details && !footerText.includes("HTTP") && (
        <div className="p-3 bg-gray-100 border border-gray-300 rounded mb-5">
          {details}
        </div>
      )}

      <div className="mt-10 text-gray-700 whitespace-pre-wrap">
        {footerText}
      </div>
    </div>
  );
}

// Add this constant for title truncation
const MAX_TITLE_LENGTH = 50;

// Debug helper to identify direct passthrough URLs
const logDirectPassthrough = (url: string) => {
  console.log(`[IE] Direct passthrough mode for: ${url}`);
};

const getHostnameFromUrl = (url: string): string => {
  try {
    const urlToUse = url.startsWith("http") ? url : `https://${url}`;
    return new URL(urlToUse).hostname;
  } catch {
    return url; // Return original if parsing fails
  }
};

const formatTitle = (title: string): string => {
  if (!title) return "Internet Explorer";
  return title.length > MAX_TITLE_LENGTH
    ? title.substring(0, MAX_TITLE_LENGTH) + "..."
    : title;
};

const getLoadingTitle = (baseTitle: string): string => {
  // If it looks like a URL, extract the hostname
  const titleToUse =
    baseTitle.includes("/") || baseTitle.includes(".")
      ? getHostnameFromUrl(baseTitle)
      : baseTitle;

  const formattedTitle = formatTitle(titleToUse);
  return formattedTitle === "Internet Explorer"
    ? "Internet Explorer - Loading"
    : `${formattedTitle} - Loading`;
};

// Helper function to decode Base64 data (client-side)
function decodeData(code: string): { url: string; year: string } | null {
  try {
    // Replace URL-safe characters back to standard Base64
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(paddedBase64);

    // Try compact format first (url|year)
    const [url, year] = decoded.split("|");
    if (typeof url === "string" && typeof year === "string") {
      return { url, year };
    }

    // If compact format fails, try JSON format
    try {
      const data = JSON.parse(decoded);
      if (typeof data.url === "string" && typeof data.year === "string") {
        return { url: data.url, year: data.year };
      }
    } catch {
      console.debug(
        "[IE] Failed to parse as JSON, not a valid share code format"
      );
    }

    console.error("[IE] Decoded data structure invalid:", { url, year });
    return null;
  } catch (error) {
    console.error("[IE] Error decoding share code:", error);
    return null;
  }
}

// Helper function to normalize URLs for history/caching
const normalizeUrlForHistory = (url: string): string => {
  let normalized = url.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, ""); // Remove trailing slash
  return normalized;
};

export function InternetExplorerAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  helpItems,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<InternetExplorerInitialData>) {
  const debugMode = useAppStore((state) => state.debugMode);
  const terminalSoundsEnabled = useAppStore(
    (state) => state.terminalSoundsEnabled
  );
  const bringToForeground = useAppStore((state) => state.bringToForeground);

  const {
    url,
    year,
    mode,
    token,
    favorites,
    history,
    historyIndex,
    isTitleDialogOpen,
    newFavoriteTitle,
    isHelpDialogOpen,
    isAboutDialogOpen,
    isNavigatingHistory,
    isClearFavoritesDialogOpen,
    isClearHistoryDialogOpen,
    currentPageTitle,
    timelineSettings,
    status,
    finalUrl,
    aiGeneratedHtml,
    errorDetails,
    isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen,
    language,
    location,
    isTimeMachineViewOpen,

    setUrl,
    setYear,
    navigateStart,
    setFinalUrl,
    loadSuccess,
    loadError,
    cancel,
    addFavorite,
    clearFavorites,
    setHistoryIndex,
    clearHistory,
    setTitleDialogOpen,
    setNewFavoriteTitle,
    setHelpDialogOpen,
    setAboutDialogOpen,
    setNavigatingHistory,
    setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen,
    handleNavigationError,
    setPrefetchedTitle,
    clearErrorDetails,
    setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen,
    setLanguage,
    setLocation,
    cachedYears,
    isFetchingCachedYears,
    setTimeMachineViewOpen,
    fetchCachedYears,
  } = useInternetExplorerStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const [hasMoreToScroll] = useState(false);
  const [isUrlDropdownOpen, setIsUrlDropdownOpen] = useState(false);
  // Define suggestion type to reuse
  type SuggestionItem = {
    title: string;
    url: string;
    type: "favorite" | "history" | "search";
    year?: string;
    favicon?: string;
    normalizedUrl?: string; // Optional prop for internal use
  };

  const [filteredSuggestions, setFilteredSuggestions] = useState<
    Array<SuggestionItem>
  >([]);
  const [localUrl, setLocalUrl] = useState<string>("");
  const [isSelectingText, setIsSelectingText] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const updateDropdownStyle = () => {
      if (isUrlDropdownOpen && urlInputRef.current) {
        const isMobileView = window.innerWidth < 640; // Tailwind 'sm' breakpoint (640px)

        if (isMobileView) {
          const inputRect = urlInputRef.current.getBoundingClientRect();
          setDropdownStyle({
            position: "fixed",
            top: `${inputRect.bottom}px`, // className's mt-[2px] will provide the visual gap
            left: "1rem", // Tailwind's space-4
            right: "1rem", // Tailwind's space-4
            zIndex: 50,
          });
        } else {
          // Not mobile, or dropdown closed/ref not available
          if (Object.keys(dropdownStyle).length > 0) {
            setDropdownStyle({});
          }
        }
      } else {
        // Dropdown not open or ref not available
        if (Object.keys(dropdownStyle).length > 0) {
          setDropdownStyle({});
        }
      }
    };

    updateDropdownStyle();
    window.addEventListener("resize", updateDropdownStyle);

    return () => {
      window.removeEventListener("resize", updateDropdownStyle);
    };
  }, [isUrlDropdownOpen, dropdownStyle]);

  // Utility to normalize URLs for comparison
  const normalizeUrlInline = (url: string): string => {
    if (!url) return "";
    let normalized = url.trim().toLowerCase();
    normalized = normalized.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
    normalized = normalized.replace(/\/$/g, "");
    normalized = normalized.replace(/^www\./i, "");
    return normalized;
  };

  // Strip protocol prefixes for display
  const stripProtocol = (url: string): string => {
    if (!url) return "";
    return url.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
  };

  // Helper to validate if a URL is well-formed enough to be saved
  const isValidUrl = useCallback(
    (urlString: string): boolean => {
      // Fairly permissive validation - checks for at least a domain-like structure
      if (!urlString || !urlString.trim()) return false;

      // We shouldn't have protocols at this point, but just in case
      const trimmed = stripProtocol(urlString.trim());

      // Check for at least something that looks like a domain
      // Accept: domain.tld, domain, localhost, IP addresses
      // Make sure it doesn't start with "bing:" which is our internal marker
      if (trimmed.startsWith("bing:")) return false;

      return (
        /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?/i.test(
          trimmed
        ) ||
        /^localhost(:[0-9]+)?$/i.test(trimmed) ||
        /^(\d{1,3}\.){3}\d{1,3}(:[0-9]+)?$/i.test(trimmed)
      );
    },
    [stripProtocol]
  );

  const urlInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);

  const {
    generateFuturisticWebsite,
    aiGeneratedHtml: generatedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    stopGeneration,
  } = useAiGeneration({
    onLoadingChange: () => {},
    customTimeline: timelineSettings,
  });

  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();

  const currentYear = new Date().getFullYear();
  const pastYears = [
    "1000 BC",
    "1 CE",
    "500",
    "800",
    "1000",
    "1200",
    "1400",
    "1600",
    "1700",
    "1800",
    "1900",
    "1910",
    "1920",
    "1930",
    "1940",
    "1950",
    "1960",
    "1970",
    "1980",
    "1985",
    "1990",
    ...Array.from({ length: currentYear - 1991 + 1 }, (_, i) =>
      (1991 + i).toString()
    ).filter((year) => parseInt(year) !== currentYear),
  ].reverse();
  const futureYears = [
    ...Array.from({ length: 8 }, (_, i) => (2030 + i * 10).toString()).filter(
      (year) => parseInt(year) !== currentYear
    ),
    "2150",
    "2200",
    "2250",
    "2300",
    "2400",
    "2500",
    "2750",
    "3000",
  ].sort((a, b) => parseInt(b) - parseInt(a));

  const [displayTitle, setDisplayTitle] = useState<string>("Internet Explorer");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const clearInitialData = useAppStore((state) => state.clearInitialData);
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  useEffect(() => {
    let newTitle = "Internet Explorer";
    const baseTitle = currentPageTitle || url;
    const isTimeTravelling = status === "loading" && year !== "current";

    if (isTimeTravelling) {
      const titleToUse =
        baseTitle.includes("/") || baseTitle.includes(".")
          ? getHostnameFromUrl(baseTitle)
          : baseTitle;
      const formattedTitle = formatTitle(titleToUse);
      newTitle =
        formattedTitle === "Internet Explorer"
          ? "Internet Explorer - Travelling"
          : `${formattedTitle} - Travelling`;
    } else if (status === "loading") {
      newTitle = getLoadingTitle(baseTitle);
    } else if (currentPageTitle) {
      newTitle = formatTitle(currentPageTitle);
    } else if (finalUrl) {
      try {
        const urlToParse =
          finalUrl.startsWith("http") || finalUrl.startsWith("/")
            ? finalUrl
            : `https://${finalUrl}`;
        const effectiveUrl = urlToParse.startsWith("/api/iframe-check")
          ? url
          : urlToParse;
        const hostname = new URL(
          effectiveUrl.startsWith("http")
            ? effectiveUrl
            : `https://${effectiveUrl}`
        ).hostname;
        newTitle = formatTitle(hostname);
      } catch {
        try {
          const fallbackHostname = getHostnameFromUrl(url);
          newTitle = formatTitle(fallbackHostname);
        } catch {
          console.debug(
            "[IE] Failed to parse both finalUrl and url for title:",
            finalUrl,
            url
          );
          newTitle = "Internet Explorer";
        }
      }
    }

    setDisplayTitle(newTitle);
  }, [status, currentPageTitle, finalUrl, url, year]);

  const getWaybackUrl = async (targetUrl: string, year: string) => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const formattedUrl = targetUrl.startsWith("http")
      ? targetUrl
      : `https://${targetUrl}`;
    console.log(
      `[IE] Using Wayback Machine URL for ${formattedUrl} in ${year}`
    );
    return `/api/iframe-check?url=${encodeURIComponent(
      formattedUrl
    )}&year=${year}&month=${month}`;
  };

  // Ref to keep the most recent navigation token in sync without waiting for a render
  const navTokenRef = useRef<number>(0);

  const handleIframeLoad = async () => {
    if (
      iframeRef.current &&
      iframeRef.current.dataset.navToken === navTokenRef.current.toString()
    ) {
      const iframeSrc = iframeRef.current.src;
      if (
        iframeSrc.includes("/api/iframe-check") &&
        iframeRef.current.contentDocument
      ) {
        try {
          const textContent =
            iframeRef.current.contentDocument.body?.textContent?.trim();
          if (textContent) {
            try {
              const potentialErrorData = JSON.parse(
                textContent
              ) as ErrorResponse;
              if (
                potentialErrorData &&
                potentialErrorData.error === true &&
                potentialErrorData.type
              ) {
                console.log(
                  "[IE] Detected JSON error response in iframe body:",
                  potentialErrorData
                );
                track(IE_ANALYTICS.NAVIGATION_ERROR, {
                  url: iframeSrc,
                  type: potentialErrorData.type,
                  status: potentialErrorData.status || 500,
                  message: potentialErrorData.message,
                });
                handleNavigationError(potentialErrorData, url);
                return;
              }
            } catch (parseError) {
              console.debug(
                "[IE] Iframe body content was not a JSON error:",
                parseError
              );
            }
          }

          const contentType = iframeRef.current.contentDocument.contentType;
          if (contentType === "application/json") {
            const text = iframeRef.current.contentDocument.body.textContent;
            if (text) {
              const errorData = JSON.parse(text) as ErrorResponse;
              if (errorData.error) {
                console.log(
                  "[IE] Detected error response (via content-type check):",
                  errorData
                );
                track(IE_ANALYTICS.NAVIGATION_ERROR, {
                  url: iframeSrc,
                  type: errorData.type,
                  status: errorData.status || 500,
                });
                handleNavigationError(errorData, url);
                return;
              }
            }
          }
        } catch (error) {
          console.warn("[IE] Error processing iframe content:", error);
        }
      }

      clearErrorDetails();

      setTimeout(() => {
        if (
          iframeRef.current &&
          iframeRef.current.dataset.navToken === navTokenRef.current.toString()
        ) {
          let loadedTitle: string | null = null;
          const currentUrlForFallback = url;
          const fallbackTitle = currentUrlForFallback
            ? new URL(
                currentUrlForFallback.startsWith("http")
                  ? currentUrlForFallback
                  : `https://${currentUrlForFallback}`
              ).hostname
            : "Internet Explorer";

          try {
            loadedTitle = iframeRef.current?.contentDocument?.title || null;
            if (loadedTitle) {
              const txt = document.createElement("textarea");
              txt.innerHTML = loadedTitle;
              loadedTitle = txt.value.trim();
            }
          } catch (error) {
            console.warn(
              "[IE] Failed to read iframe document title directly:",
              error
            );
          }

          if (!loadedTitle && finalUrl?.startsWith("/api/iframe-check")) {
            try {
              const metaTitle = iframeRef.current?.contentDocument
                ?.querySelector('meta[name="page-title"]')
                ?.getAttribute("content");
              if (metaTitle) {
                loadedTitle = decodeURIComponent(metaTitle);
              }
            } catch (error) {
              console.warn("[IE] Failed to read page-title meta tag:", error);
            }
          }

          const favicon = `https://www.google.com/s2/favicons?domain=${
            new URL(
              currentUrlForFallback.startsWith("http")
                ? currentUrlForFallback
                : `https://${currentUrlForFallback}`
            ).hostname
          }&sz=32`;

          track(IE_ANALYTICS.NAVIGATION_SUCCESS, {
            url: currentUrlForFallback,
            year: year,
            mode: mode,
            title: loadedTitle || fallbackTitle,
          });

          loadSuccess({
            title: loadedTitle || fallbackTitle,
            targetUrl: currentUrlForFallback,
            targetYear: year,
            favicon: favicon,
            addToHistory: !isNavigatingHistory,
          });
        }
      }, 50);
    }
  };

  const handleIframeError = () => {
    if (
      iframeRef.current &&
      iframeRef.current.dataset.navToken === navTokenRef.current.toString()
    ) {
      setTimeout(() => {
        if (
          iframeRef.current &&
          iframeRef.current.dataset.navToken === navTokenRef.current.toString()
        ) {
          try {
            const targetUrlForError = finalUrl || url;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: targetUrlForError,
              type: "connection_error",
              status: 404,
            });
            handleNavigationError(
              {
                error: true,
                type: "connection_error",
                status: 404,
                message: `Cannot access ${targetUrlForError}. The website might be blocking access or requires authentication.`,
                details:
                  "The page could not be loaded in the iframe. This could be due to security restrictions or network issues.",
              },
              targetUrlForError
            );
          } catch (error) {
            const errorMsg = `Cannot access the requested website. ${
              error instanceof Error ? error.message : String(error)
            }`;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: finalUrl || url,
              type: "generic_error",
              error: errorMsg,
            });
            loadError(errorMsg, {
              error: true,
              type: "generic_error",
              message: errorMsg,
            });
          }
        }
      }, 50);
    }
  };

  const handleNavigate = useCallback(
    async (
      targetUrlParam: string = localUrl || url,
      targetYearParam: string = year,
      forceRegenerate = false,
      currentHtmlContent: string | null = null
    ) => {
      clearErrorDetails();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (isAiLoading) {
        stopGeneration();
      }
      if (iframeRef.current && status === "loading") {
        iframeRef.current.src = "about:blank";
      }

      const newMode =
        targetYearParam === "current"
          ? "now"
          : parseInt(targetYearParam) > new Date().getFullYear()
          ? "future"
          : "past";
      const newToken = Date.now();

      // --- Trim the URL from input before navigating ---
      // Use targetUrlParam directly as it's passed in, or trim the current store url if not passed
      const urlToNavigate = (
        targetUrlParam === url ? url.trim() : targetUrlParam
      ).trim();
      // Update store immediately so the input reflects the trimmed URL during loading
      setUrl(urlToNavigate);
      // --- End Trim ---

      // Store the latest token immediately so that asynchronous iframe load/error
      // handlers fired before the next React render can still validate correctly.
      navTokenRef.current = newToken;

      track(IE_ANALYTICS.NAVIGATION_START, {
        url: urlToNavigate,
        year: targetYearParam,
        mode: newMode,
      });

      navigateStart(urlToNavigate, targetYearParam, newMode, newToken);

      const normalizedTargetUrl = urlToNavigate.startsWith("http")
        ? urlToNavigate
        : `https://${urlToNavigate}`;

      try {
        if (
          newMode === "future" ||
          (newMode === "past" && parseInt(targetYearParam) <= 1995)
        ) {
          // Local caching removed to save localStorage space

          let remoteCacheHit = false;
          if (!forceRegenerate) {
            try {
              console.log(
                `[IE] Checking REMOTE cache for ${normalizedTargetUrl} in ${targetYearParam}...`
              );
              const res = await fetch(
                `/api/iframe-check?mode=ai&url=${encodeURIComponent(
                  normalizedTargetUrl
                )}&year=${targetYearParam}`
              );
              console.log(
                `[IE] Remote cache response status: ${res.status}, ok: ${
                  res.ok
                }, content-type: ${res.headers.get("content-type")}`
              );

              if (
                res.ok &&
                (res.headers.get("content-type") || "").includes("text/html")
              ) {
                remoteCacheHit = true;
                const html = await res.text();
                console.log(
                  `[IE] REMOTE cache HIT. Processing content (length: ${html.length})`
                );
                const titleMatch = html.match(/^<!--\s*TITLE:\s*(.*?)\s*-->/);
                const parsedTitle = titleMatch ? titleMatch[1].trim() : null;
                const cleanHtml = html.replace(
                  /^<!--\s*TITLE:.*?-->\s*\n?/,
                  ""
                );

                // Local caching removed to save localStorage space
                // Refresh cached years to update the count
                fetchCachedYears(normalizedTargetUrl);

                const favicon = `https://www.google.com/s2/favicons?domain=${
                  new URL(normalizedTargetUrl).hostname
                }&sz=32`;
                loadSuccess({
                  aiGeneratedHtml: cleanHtml,
                  title: parsedTitle || normalizedTargetUrl,
                  targetUrl: normalizedTargetUrl,
                  targetYear: targetYearParam,
                  favicon,
                  addToHistory: true,
                });
                console.log("[IE] Returning early after remote cache hit.");
                return;
              } else {
                console.log(`[IE] REMOTE cache MISS or invalid response.`);
              }
            } catch (e) {
              console.warn("[IE] AI remote cache fetch failed", e);
            }
          }

          if (remoteCacheHit) {
            console.error(
              "[IE] Logic error: Should have returned on remote cache hit, but didn't!"
            );
            return;
          }

          console.log(
            `[IE] No cache hit (Remote: ${remoteCacheHit}, Force: ${forceRegenerate}). Proceeding to generate...`
          );
          if (playElevatorMusic && terminalSoundsEnabled) {
            playElevatorMusic(newMode);
          }

          try {
            await generateFuturisticWebsite(
              normalizedTargetUrl,
              targetYearParam,
              abortController.signal,
              null,
              currentHtmlContent
            );
            if (abortController.signal.aborted) return;
          } catch (error) {
            if (abortController.signal.aborted) return;
            console.error("[IE] AI generation error:", error);
            handleNavigationError(
              {
                error: true,
                type: "ai_generation_error",
                message:
                  "Failed to generate futuristic website. AI model may not be selected.",
                details: error instanceof Error ? error.message : String(error),
              },
              normalizedTargetUrl
            );
            return;
          }
        } else {
          let urlToLoad = normalizedTargetUrl;

          if (newMode === "past") {
            try {
              const waybackUrl = await getWaybackUrl(
                normalizedTargetUrl,
                targetYearParam
              );
              if (abortController.signal.aborted) return;
              if (waybackUrl) {
                urlToLoad = waybackUrl;
              } else {
                await generateFuturisticWebsite(
                  normalizedTargetUrl,
                  targetYearParam,
                  abortController.signal,
                  null,
                  currentHtmlContent
                );
                if (abortController.signal.aborted) return;
                return;
              }
            } catch (waybackError) {
              if (abortController.signal.aborted) return;
              console.warn(
                `[IE] Wayback Machine error for ${normalizedTargetUrl}:`,
                waybackError
              );
              await generateFuturisticWebsite(
                normalizedTargetUrl,
                targetYearParam,
                abortController.signal,
                null,
                currentHtmlContent
              );
              if (abortController.signal.aborted) return;
              return;
            }
          } else if (newMode === "now") {
            // Check if domain should bypass proxy
            const isDirectBypass = isDirectPassthrough(normalizedTargetUrl);

            if (isDirectBypass) {
              logDirectPassthrough(normalizedTargetUrl);
              urlToLoad = normalizedTargetUrl;
            } else {
              // Proxy current year sites through iframe-check
              urlToLoad = `/api/iframe-check?url=${encodeURIComponent(
                normalizedTargetUrl
              )}`;
            }

            try {
              const checkRes = await fetch(
                `/api/iframe-check?mode=check&url=${encodeURIComponent(
                  normalizedTargetUrl
                )}`,
                { signal: abortController.signal }
              );
              if (abortController.signal.aborted) return;

              if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.title) {
                  setPrefetchedTitle(checkData.title);
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") return;
              console.warn(`[IE] iframe-check fetch failed:`, error);
            }
          }

          if (urlToLoad === finalUrl) {
            urlToLoad = `${urlToLoad}${
              urlToLoad.includes("?") ? "&" : "?"
            }_t=${Date.now()}`;
          }

          setFinalUrl(urlToLoad);

          if (iframeRef.current) {
            iframeRef.current.dataset.navToken = newToken.toString();
            iframeRef.current.src = urlToLoad;
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(`[IE] Navigation error:`, error);
          handleNavigationError(
            {
              error: true,
              type: "navigation_error",
              message: `Failed to navigate: ${
                error instanceof Error ? error.message : String(error)
              }`,
              details: error instanceof Error ? error.stack : undefined,
            },
            normalizedTargetUrl
          );
        }
      }
    },
    [
      url,
      year,
      finalUrl,
      status,
      token,
      isAiLoading,
      isNavigatingHistory,
      currentPageTitle,
      aiGeneratedHtml,
      navigateStart,
      setFinalUrl,
      loadError,
      generateFuturisticWebsite,
      stopGeneration,
      loadSuccess,
      clearErrorDetails,
      handleNavigationError,
      setPrefetchedTitle,
      setYear,
      setUrl,
      fetchCachedYears,
    ]
  );

  const handleNavigateWithHistory = useCallback(
    async (targetUrl: string, targetYear?: string) => {
      setNavigatingHistory(false);
      setIsUrlDropdownOpen(false);
      handleNavigate(targetUrl, targetYear || year, false);
    },
    [handleNavigate, setNavigatingHistory, year]
  );

  const handleFilterSuggestions = useCallback(
    (inputValue: string) => {
      if (!inputValue.trim()) {
        // When URL bar is empty, show top 3 favorites
        const topFavorites: Array<SuggestionItem> = [];

        // First check for regular favorites (non-folders)
        favorites.forEach((fav) => {
          if (!fav.children && fav.url) {
            topFavorites.push({
              title: fav.title || "",
              url: fav.url,
              type: "favorite" as const,
              year: fav.year,
              favicon: fav.favicon,
            });
          }
        });

        // If we still have space, add favorites from folders
        if (topFavorites.length) {
          favorites.forEach((fav) => {
            if (fav.children && fav.children.length > 0) {
              fav.children.forEach((child) => {
                if (child.url) {
                  topFavorites.push({
                    title: child.title || "",
                    url: child.url,
                    type: "favorite" as const,
                    year: child.year,
                    favicon: child.favicon,
                  });
                }
              });
            }
          });
        }

        setFilteredSuggestions(topFavorites);
        setSelectedSuggestionIndex(topFavorites.length > 0 ? 0 : -1);
        return;
      }

      const normalizedInput = inputValue.toLowerCase();

      // Utility to normalize URLs inline for comparison
      const normalizeUrlInline = (url: string): string => {
        if (!url) return "";
        let normalized = url.trim().toLowerCase();
        normalized = normalized.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
        normalized = normalized.replace(/\/$/g, "");
        normalized = normalized.replace(/^www\./i, "");
        return normalized;
      };

      // Function to process a single favorite
      const processFavorite = (fav: Favorite) => {
        // Match by title or URL
        if (
          fav.title?.toLowerCase().includes(normalizedInput) ||
          fav.url?.toLowerCase().includes(normalizedInput)
        ) {
          return {
            title: fav.title || "",
            url: fav.url || "",
            type: "favorite" as const,
            year: fav.year,
            favicon: fav.favicon,
            normalizedUrl: normalizeUrlInline(fav.url || ""),
          };
        }
        return null;
      };

      // Array to collect all matched favorites
      const allFavoriteSuggestions: Array<SuggestionItem> = [];

      // Process all favorites, including those in folders
      favorites.forEach((fav) => {
        if (fav.children) {
          // If it's a folder, process each child
          fav.children.forEach((child) => {
            const match = processFavorite(child);
            if (match) allFavoriteSuggestions.push(match);
          });
        } else if (fav.url) {
          // If it's a regular favorite
          const match = processFavorite(fav);
          if (match) allFavoriteSuggestions.push(match);
        }
      });

      // Process history items
      const historySuggestions = history
        .filter(
          (entry) =>
            !entry.url.startsWith("https://www.bing.com/search?q=") &&
            (entry.title?.toLowerCase().includes(normalizedInput) ||
              entry.url.toLowerCase().includes(normalizedInput))
        )
        .slice(0, 5) // Limit history suggestions
        .map((entry) => ({
          title: entry.title || entry.url,
          url: entry.url,
          type: "history" as const,
          year: entry.year,
          favicon: entry.favicon,
          normalizedUrl: normalizeUrlInline(entry.url),
        }));

      // Combine all suggestions
      const combinedSuggestions = [
        ...allFavoriteSuggestions,
        ...historySuggestions,
      ];

      // Deduplicate based on normalized URL
      const uniqueUrls = new Set<string>();
      const dedupedSuggestions = combinedSuggestions.filter((suggestion) => {
        if (
          !suggestion.normalizedUrl ||
          uniqueUrls.has(suggestion.normalizedUrl)
        ) {
          return false;
        }
        uniqueUrls.add(suggestion.normalizedUrl);
        return true;
      });

      // Create final suggestions without the normalizedUrl property
      const finalSuggestions: SuggestionItem[] = dedupedSuggestions.map(
        (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { normalizedUrl, ...rest } = item;
          return rest;
        }
      );

      console.log(
        "[IE Debug] Input:",
        inputValue,
        "Is Valid:",
        isValidUrl(inputValue)
      );

      if (inputValue.trim() && !isValidUrl(inputValue)) {
        finalSuggestions.push({
          title: `Search "${inputValue}"`,
          url: `bing:${inputValue}`, // Special marker for search
          type: "search" as const,
          favicon: "/icons/bing.png", // Assumes a bing icon exists
        });
      }

      setFilteredSuggestions(finalSuggestions);
      setSelectedSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
    },
    [favorites, history, isValidUrl]
  );

  const handleGoBack = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [
    history,
    historyIndex,
    setHistoryIndex,
    handleNavigate,
    setNavigatingHistory,
  ]);

  const handleGoForward = useCallback(() => {
    if (historyIndex > 0) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [
    history,
    historyIndex,
    setHistoryIndex,
    handleNavigate,
    setNavigatingHistory,
  ]);

  const handleAddFavorite = useCallback(() => {
    const titleSource =
      currentPageTitle ||
      (() => {
        try {
          // If finalUrl exists and is an absolute http/https URL, use it directly.
          if (finalUrl && finalUrl.startsWith("http")) {
            return new URL(finalUrl).hostname;
          }
          // If finalUrl is a relative path (e.g. starts with /api/iframe-check), fall back to the main url.
          const candidate =
            finalUrl && !finalUrl.startsWith("/") ? finalUrl : url;
          if (candidate) {
            return new URL(
              candidate.startsWith("http") ? candidate : `https://${candidate}`
            ).hostname;
          }
        } catch (error) {
          console.error(
            "[IE] Error extracting hostname for favorite title:",
            error
          );
        }
        return "Page";
      })();
    setNewFavoriteTitle(titleSource);
    setTitleDialogOpen(true);
  }, [
    currentPageTitle,
    finalUrl,
    url,
    setNewFavoriteTitle,
    setTitleDialogOpen,
  ]);

  const handleTitleSubmit = useCallback(() => {
    if (!newFavoriteTitle) return;
    const favUrl = url;
    const favHostname = (() => {
      try {
        if (finalUrl && finalUrl.startsWith("http")) {
          return new URL(finalUrl).hostname;
        }
        const candidate =
          finalUrl && !finalUrl.startsWith("/") ? finalUrl : favUrl;
        if (candidate) {
          return new URL(
            candidate.startsWith("http") ? candidate : `https://${candidate}`
          ).hostname;
        }
      } catch (error) {
        console.error(
          "[IE] Error extracting hostname for favorite icon:",
          error
        );
      }
      return "unknown.com";
    })();
    const favIcon = `https://www.google.com/s2/favicons?domain=${favHostname}&sz=32`;
    addFavorite({
      title: newFavoriteTitle,
      url: favUrl,
      favicon: favIcon,
      year: year !== "current" ? year : undefined,
    });
    setTitleDialogOpen(false);
  }, [newFavoriteTitle, addFavorite, finalUrl, url, year, setTitleDialogOpen]);

  const handleResetFavorites = useCallback(() => {
    clearFavorites();
    DEFAULT_FAVORITES.forEach((fav) => addFavorite(fav));
    setResetFavoritesDialogOpen(false);
  }, [clearFavorites, addFavorite, setResetFavoritesDialogOpen]);

  const handleClearFavorites = useCallback(() => {
    clearFavorites();
    setClearFavoritesDialogOpen(false);
  }, [clearFavorites, setClearFavoritesDialogOpen]);

  const handleRefresh = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (iframeRef.current) iframeRef.current.src = "about:blank";
    handleNavigate(url, year, true);
  }, [handleNavigate, url, year]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    cancel();
    if (isAiLoading) {
      stopGeneration();
    }
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
    clearErrorDetails();

    if (stopElevatorMusic) {
      stopElevatorMusic();
    }
  }, [
    cancel,
    isAiLoading,
    stopGeneration,
    clearErrorDetails,
    stopElevatorMusic,
  ]);

  const handleGoToUrl = useCallback(() => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
    setIsSelectingText(true);
  }, []);

  const handleHome = useCallback(() => {
    handleNavigate("apple.com", "2002");
  }, [handleNavigate]);

  // Use a ref to prevent duplicate initial navigations
  const initialNavigationRef = useRef(false);
  // Track the last processed initialData to avoid duplicates
  const lastProcessedInitialDataRef = useRef<unknown>(null);
  // Sync localUrl with store's url when the component loads or url changes from outside
  useEffect(() => {
    setLocalUrl(stripProtocol(url));
  }, [url]);

  useEffect(() => {
    // Only run initial navigation logic once when the window opens
    if (!initialNavigationRef.current && isWindowOpen) {
      initialNavigationRef.current = true;
      console.log(
        "[IE] Running initial navigation check. Received initialData:",
        initialData
      );

      // Check if initialData contains a shareCode (passed via props on first open)
      if (initialData?.shareCode) {
        const code = initialData.shareCode;
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(
            `[IE] Decoded share link from initialData prop: ${decodedData.url} (${decodedData.year})`
          );
          toast.info(`Opening shared page`, {
            description: `${decodedData.url}${
              decodedData.year && decodedData.year !== "current"
                ? ` from ${decodedData.year}`
                : ""
            }`,
            duration: 4000,
          });
          // Navigate using decoded data
          setTimeout(() => {
            handleNavigate(
              decodedData.url,
              decodedData.year || "current",
              false
            );
            // Clear initialData after navigation is initiated
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            } else {
              clearInitialData("internet-explorer");
            }
          }, 0);
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
          return; // Skip other initial navigation
        } else {
          console.warn(
            "[IE] Failed to decode share link code from initialData prop."
          );
          toast.error("Invalid Share Link", {
            description: "The share link provided is invalid or corrupted.",
            duration: 5000,
          });
          // Fall through to check for direct url/year or default navigation
        }
      }

      // --- NEW: Check for direct url and year in initialData ---
      if (initialData?.url && typeof initialData.url === "string") {
        const initialUrl = initialData.url;
        const initialYear =
          typeof initialData.year === "string" ? initialData.year : "current"; // Default to 'current' if year is missing or invalid
        console.log(
          `[IE] Navigating based on initialData url/year: ${initialUrl} (${initialYear})`
        );

        // --- FIX: Update store state BEFORE navigating and pass values directly ---
        setUrl(initialUrl);
        setYear(initialYear);
        // --- END FIX ---

        toast.info(`Opening requested page`, {
          description: `${initialUrl}${
            initialYear !== "current" ? ` from ${initialYear}` : ""
          }`,
          duration: 4000,
        });
        setTimeout(() => {
          // --- FIX: Pass initialUrl and initialYear directly ---
          handleNavigate(initialUrl, initialYear, false);
          // Clear initialData after navigation is initiated
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          } else {
            clearInitialData("internet-explorer");
          }
          // --- END FIX ---
        }, 0);
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = initialData;
        return; // Skip default navigation
      }
      // --- END NEW ---

      // Proceed with default navigation if not a share link or if decoding failed
      console.log("[IE] Proceeding with default navigation.");
      setTimeout(() => {
        handleNavigate(url, year, false);
      }, 0);
    }
  }, [
    initialData,
    isWindowOpen,
    handleNavigate,
    url,
    year,
    clearInitialData,
    clearInstanceInitialData,
    instanceId,
  ]);

  // --- Watch for initialData changes when app is already open ---
  useEffect(() => {
    // Only react to initialData changes if the window is already open and we have initialData
    if (!isWindowOpen || !initialData) return;

    // Skip if this initialData has already been processed
    if (lastProcessedInitialDataRef.current === initialData) return;

    // Only process if this is NOT the initial mount (initial navigation has already happened)
    if (initialNavigationRef.current === true) {
      console.log(
        "[IE] Detected initialData change for open window:",
        initialData
      );

      const typedInitialData = initialData as InternetExplorerInitialData;

      if (typedInitialData.shareCode) {
        const code = typedInitialData.shareCode;
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(
            `[IE] Navigating to shared link: ${decodedData.url} (${decodedData.year})`
          );
          toast.info(`Opening shared page`, {
            description: `${decodedData.url}${
              decodedData.year && decodedData.year !== "current"
                ? ` from ${decodedData.year}`
                : ""
            }`,
            duration: 4000,
          });
          setTimeout(() => {
            handleNavigate(
              decodedData.url,
              decodedData.year || "current",
              false
            );
            // Clear initialData after navigation
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            } else {
              clearInitialData("internet-explorer");
            }
          }, 50);
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
        }
      } else if (
        typedInitialData.url &&
        typeof typedInitialData.url === "string"
      ) {
        const navUrl = typedInitialData.url;
        const navYear =
          typeof typedInitialData.year === "string"
            ? typedInitialData.year
            : "current";

        console.log(
          `[IE] Navigating to direct url/year: ${navUrl} (${navYear})`
        );
        toast.info(`Opening requested page`, {
          description: `${navUrl}${
            navYear !== "current" ? ` from ${navYear}` : ""
          }`,
          duration: 4000,
        });

        setTimeout(() => {
          handleNavigate(navUrl, navYear, false);
          // Clear initialData after navigation
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          } else {
            clearInitialData("internet-explorer");
          }
        }, 50);
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = initialData;
      }
    }
  }, [
    isWindowOpen,
    initialData,
    handleNavigate,
    clearInitialData,
    clearInstanceInitialData,
    instanceId,
  ]);

  // --- Add listener for updateApp event (handles share links when app is already open) ---
  useEffect(() => {
    // Define a type for the initialData expected in the event detail
    interface AppUpdateInitialData {
      shareCode?: string;
      url?: string; // Add url
      year?: string; // Add year
    }

    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: AppUpdateInitialData }>
    ) => {
      if (event.detail.appId === "internet-explorer") {
        const initialData = event.detail.initialData;

        // Skip if this initialData has already been processed
        if (lastProcessedInitialDataRef.current === initialData) return;

        if (initialData?.shareCode) {
          const code = initialData.shareCode;
          console.log("[IE] Received updateApp event with shareCode:", code);
          const decodedData = decodeData(code);

          if (decodedData) {
            console.log(
              `[IE] Decoded share link from updateApp event: ${decodedData.url} (${decodedData.year})`
            );

            // Show toast and navigate
            toast.info(`Opening shared page`, {
              description: `${decodedData.url}${
                decodedData.year && decodedData.year !== "current"
                  ? ` from ${decodedData.year}`
                  : ""
              }`,
              duration: 4000,
            });
            // Use timeout to allow potential state updates (like foreground) to settle
            setTimeout(() => {
              handleNavigate(
                decodedData.url,
                decodedData.year || "current",
                false
              );
            }, 50); // Small delay
            // Mark this initialData as processed
            lastProcessedInitialDataRef.current = initialData;
          } else {
            console.warn(
              "[IE] Failed to decode share link code from updateApp event."
            );
            toast.error("Invalid Share Link", {
              description: "The share link provided is invalid or corrupted.",
              duration: 5000,
            });
          }
        } else if (initialData?.url && typeof initialData.url === "string") {
          // --- NEW: Handle direct url/year from updateApp event ---
          const directUrl = initialData.url;
          const directYear =
            typeof initialData.year === "string" ? initialData.year : "current";
          console.log(
            `[IE] Received updateApp event with direct url/year: ${directUrl} (${directYear})`
          );

          // Show toast and navigate
          toast.info(`Opening requested page`, {
            description: `${directUrl}${
              directYear !== "current" ? ` from ${directYear}` : ""
            }`,
            duration: 4000,
          });

          // Use timeout to allow potential state updates (like foreground) to settle
          setTimeout(() => {
            handleNavigate(directUrl, directYear, false);
          }, 50); // Small delay
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
          // --- END NEW ---
        }
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
    // Add bringToForeground and isForeground to dependencies
  }, [handleNavigate, bringToForeground, isForeground]);
  // --- End updateApp listener ---

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        event.data.type === "iframeNavigation" &&
        typeof event.data.url === "string"
      ) {
        console.log(
          `[IE] Received navigation request from iframe: ${event.data.url}`
        );
        handleNavigate(event.data.url, year);
      } else if (event.data && event.data.type === "goBack") {
        console.log(`[IE] Received back button request from iframe`);
        handleGoBack();
      } else if (
        event.data &&
        event.data.type === "aiHtmlNavigation" &&
        typeof event.data.url === "string"
      ) {
        console.log(
          `[IE] Received navigation request from AI HTML preview: ${event.data.url}`
        );
        // Fetch the most up-to-date HTML from the store in case the closure is stale
        const latestAiHtml =
          useInternetExplorerStore.getState().aiGeneratedHtml;
        const contextHtml = generatedHtml || latestAiHtml;

        handleNavigate(event.data.url, year, false, contextHtml);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [year, handleNavigate, handleGoBack, generatedHtml]); // Added generatedHtml to dependencies

  useEffect(() => {
    if (!isWindowOpen) {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    }
  }, [isWindowOpen, stopElevatorMusic]);

  useEffect(() => {
    const container = favoritesContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      if (!container) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAiLoading && !isFetchingWebsiteContent && status !== "loading") {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
    }
  }, [isAiLoading, isFetchingWebsiteContent, status, stopElevatorMusic]);

  const getDebugStatusMessage = () => {
    if (!(status === "loading" || isAiLoading || isFetchingWebsiteContent))
      return null;

    const hostname = url ? getHostnameFromUrl(url) : "unknown";
    const aiModel = useAppStore.getState().aiModel;
    const modelInfo = aiModel ? `${aiModel} ` : "";

    // Get language and location display names
    const languageDisplayName =
      language !== "auto" ? getLanguageDisplayName(language) : "";
    const locationDisplayName =
      location !== "auto" ? getLocationDisplayName(location) : "";

    if (isFetchingWebsiteContent) {
      return (
        <div className="flex items-center gap-1">
          {debugMode && <span className="text-gray-500">Fetch</span>}
          <span>{`Fetching content of ${hostname} for reconstruction...`}</span>
        </div>
      );
    }

    switch (mode) {
      case "future":
        return (
          <div className="flex items-center gap-1">
            {debugMode && (
              <span className="text-gray-500">
                {modelInfo}
                {language !== "auto" && ` ${languageDisplayName}`}
                {location !== "auto" && ` ${locationDisplayName}`}
              </span>
            )}
            <span>{`Reimagining ${hostname} for year ${year}...`}</span>
          </div>
        );
      case "past":
        if (parseInt(year) <= 1995) {
          return (
            <div className="flex items-center gap-1">
              {debugMode && (
                <span className="text-gray-500">
                  {modelInfo}
                  {language !== "auto" && ` ${languageDisplayName}`}
                  {location !== "auto" && ` ${locationDisplayName}`}
                </span>
              )}
              <span>{`Reconstructing history of ${hostname} for year ${year}...`}</span>
            </div>
          );
        }
        return `Fetching ${hostname} from year ${year}...`;
      case "now":
        return `Loading ${hostname}...`;
      default:
        return `Loading ${hostname}...`;
    }
  };

  // --- Add custom sorting logic for TimeMachineView ---
  const chronologicallySortedYears = useMemo(() => {
    const parseYear = (yearStr: string): number => {
      if (yearStr === "current") return new Date().getFullYear() + 0.5; // Place 'current' slightly after the current year number
      if (yearStr.endsWith(" BC")) {
        return -parseInt(yearStr.replace(" BC", ""), 10);
      }
      if (yearStr.endsWith(" CE")) {
        return parseInt(yearStr.replace(" CE", ""), 10);
      }
      const yearNum = parseInt(yearStr, 10);
      return isNaN(yearNum) ? Infinity : yearNum; // Handle potential non-numeric strings
    };

    return [...cachedYears].sort((a, b) => parseYear(a) - parseYear(b));
  }, [cachedYears]);
  // --- End custom sorting logic ---

  const handleSharePage = useCallback(() => {
    setIsShareDialogOpen(true);
  }, []);

  if (!isWindowOpen) return null;

  const isLoading =
    status === "loading" || isAiLoading || isFetchingWebsiteContent;
  const isFutureYear = mode === "future";

  const loadingBarVariants = {
    hidden: {
      height: 0,
      opacity: 0,
      transition: { duration: 0.3 },
    },
    visible: {
      height: "0.25rem",
      opacity: 1,
      transition: { duration: 0.3 },
    },
  };

  const renderErrorPage = () => {
    if (!errorDetails) return null;

    const errorHostname = errorDetails.hostname || "the website";

    const commonSuggestions: ReactNode[] = [
      "Try time traveling to a different year",
      <>
        Go{" "}
        <a
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            handleGoBack();
          }}
          className="text-red-600 underline"
        >
          Back
        </a>{" "}
        or change the URL to visit a different website
      </>,
    ];

    const refreshSuggestion: ReactNode = (
      <>
        Click the{" "}
        <a
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            handleRefresh();
          }}
          className="text-red-600 underline"
        >
          Refresh
        </a>{" "}
        link to try again
      </>
    );

    switch (errorDetails.type) {
      case "http_error":
        return (
          <ErrorPage
            title="The page cannot be displayed"
            primaryMessage="The page you are looking for might have been removed, had its name changed, or is temporarily unavailable."
            suggestions={[
              "If you typed the page address in the Address bar, make sure that it is spelled correctly.",
              <>
                Open{" "}
                <a
                  href={`https://${errorHostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-600 underline"
                >
                  {errorHostname}
                </a>{" "}
                in a new tab, and then look for links to the information you
                want.
              </>,
              <>
                Go{" "}
                <a
                  href="#"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleGoBack();
                  }}
                  className="text-red-600 underline"
                >
                  Back
                </a>{" "}
                or change the URL to try another page.
              </>,
            ]}
            details={errorHostname}
            footerText={`HTTP ${errorDetails.status || 404} - ${
              errorDetails.statusText || "Not Found"
            }\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      case "connection_error":
        return (
          <ErrorPage
            title="The page cannot be displayed"
            primaryMessage={
              errorDetails.message ||
              "Internet Explorer cannot access this website."
            }
            suggestions={[refreshSuggestion, ...commonSuggestions]}
            details={errorDetails.details || "Connection failed"}
            footerText={`Connection Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      case "ai_generation_error":
        return (
          <ErrorPage
            title="The page cannot be imagined"
            primaryMessage={errorDetails.message}
            suggestions={[refreshSuggestion, ...commonSuggestions]}
            details={errorDetails.details}
            footerText={`Time Machine Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      default:
        return (
          <ErrorPage
            title="An error occurred"
            primaryMessage={errorDetails.message}
            suggestions={[refreshSuggestion, ...commonSuggestions]}
            details={errorDetails.details}
            footerText={`Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
    }
  };

  const ieGenerateShareUrl = (
    identifier: string,
    secondary?: string
  ): string => {
    // Simple encoding function (client-side)
    const encodeData = (urlToEncode: string, yearToEncode: string): string => {
      const combined = `${urlToEncode}|${yearToEncode}`;
      return btoa(combined)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };
    const code = encodeData(identifier, secondary || "current");
    return `${window.location.origin}/internet-explorer/${code}`;
  };

  return (
    <TooltipProvider delayDuration={100}>
      <InternetExplorerMenuBar
        isWindowOpen={isWindowOpen}
        isForeground={isForeground}
        onRefresh={handleRefresh}
        onStop={handleStop}
        onFocusUrlInput={handleGoToUrl}
        onHome={handleHome}
        onShowHelp={() => setHelpDialogOpen(true)}
        onShowAbout={() => setAboutDialogOpen(true)}
        isLoading={isLoading}
        favorites={favorites}
        history={history}
        onAddFavorite={handleAddFavorite}
        onClearFavorites={() => setClearFavoritesDialogOpen(true)}
        onResetFavorites={() => setResetFavoritesDialogOpen(true)}
        onNavigateToFavorite={(favUrl, favYear) =>
          handleNavigateWithHistory(favUrl, favYear)
        }
        onNavigateToHistory={handleNavigateWithHistory}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        canGoBack={historyIndex < history.length - 1}
        canGoForward={historyIndex > 0}
        onClearHistory={() => setClearHistoryDialogOpen(true)}
        onOpenTimeMachine={() => setTimeMachineViewOpen(true)}
        onClose={onClose}
        onEditFuture={() => setFutureSettingsDialogOpen(true)}
        language={language}
        location={location}
        year={year}
        onLanguageChange={setLanguage}
        onLocationChange={setLocation}
        onYearChange={(newYear) => handleNavigate(url, newYear)}
        onSharePage={handleSharePage}
      />
      <WindowFrame
        title={displayTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="internet-explorer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col h-full w-full relative">
          <div className="flex flex-col gap-1 p-1 bg-gray-100 border-b border-black">
            <div className="flex gap-2 items-center">
              <div className="flex gap-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoBack}
                  disabled={historyIndex >= history.length - 1}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoForward}
                  disabled={historyIndex <= 0}
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSharePage}
                      className="h-8 w-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                      aria-label="Share this page"
                    >
                      <Share className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Share this page</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1 relative flex items-center">
                <Input
                  ref={urlInputRef}
                  value={localUrl}
                  onChange={(e) => {
                    // Strip any https:// prefix on input
                    const strippedValue = stripProtocol(e.target.value);
                    setLocalUrl(strippedValue);
                    handleFilterSuggestions(strippedValue);
                    setIsUrlDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsUrlDropdownOpen(false);
                      // Use the currently selected suggestion when Enter is pressed
                      if (filteredSuggestions.length > 0) {
                        const firstSuggestion =
                          filteredSuggestions[selectedSuggestionIndex];
                        if (firstSuggestion.type === "search") {
                          const searchQuery = firstSuggestion.url.substring(5); // Remove "bing:"
                          handleNavigateWithHistory(
                            `https://www.bing.com/search?q=${encodeURIComponent(
                              searchQuery
                            )}`,
                            "current"
                          );
                        } else {
                          handleNavigateWithHistory(
                            firstSuggestion.url,
                            firstSuggestion.year
                          );
                        }
                      } else if (isValidUrl(localUrl)) {
                        setUrl(localUrl);
                        handleNavigate(localUrl);
                      } else {
                        // If not valid URL and no suggestions, reset to previously valid URL
                        setLocalUrl(stripProtocol(url));
                      }
                    } else if (e.key === "Escape") {
                      setIsUrlDropdownOpen(false);
                      // Reset input to last valid URL
                      setLocalUrl(stripProtocol(url));
                    } else if (
                      e.key === "ArrowDown" &&
                      filteredSuggestions.length > 0
                    ) {
                      e.preventDefault();
                      // Set the index to 0 if not already navigating, or increment if we are
                      const nextIndex =
                        selectedSuggestionIndex < 0
                          ? 0
                          : selectedSuggestionIndex === 0
                          ? 1 // Move to second item if first is selected
                          : Math.min(
                              selectedSuggestionIndex + 1,
                              filteredSuggestions.length - 1
                            );
                      setSelectedSuggestionIndex(nextIndex);

                      // Find the item at our desired index
                      const dropdown = document.querySelector(
                        "[data-dropdown-content]"
                      );
                      const items = dropdown?.querySelectorAll(
                        "[data-dropdown-item]"
                      );
                      const targetItem = items?.[nextIndex] as HTMLElement;

                      if (targetItem) targetItem.focus();
                      else urlInputRef.current?.focus();
                    }
                  }}
                  onBlur={(e) => {
                    // Don't close dropdown if focus is moving to dropdown items
                    // Only close if clicking outside completely
                    if (
                      !e.relatedTarget ||
                      !e.relatedTarget.hasAttribute("data-dropdown-item")
                    ) {
                      setTimeout(() => setIsUrlDropdownOpen(false), 150);
                    }
                    // Done selecting text
                    setIsSelectingText(false);
                  }}
                  onFocus={() => {
                    // Select all text when focused
                    if (!isSelectingText) {
                      setIsSelectingText(true);
                      setTimeout(() => {
                        if (urlInputRef.current) {
                          urlInputRef.current.select();
                        }
                      }, 0);
                    }

                    // Always call handleFilterSuggestions - it will handle empty URL case
                    handleFilterSuggestions(localUrl);
                    setIsUrlDropdownOpen(true);
                  }}
                  className="flex-1 pr-8 !text-[16px]"
                  placeholder="Enter URL"
                  spellCheck="false"
                  autoComplete="off"
                  autoCapitalize="off"
                />
                {isUrlDropdownOpen &&
                  filteredSuggestions.length > 0 &&
                  // Show dropdown if we have suggestions and either:
                  // 1. URL is empty (showing our favorites) or
                  // 2. There isn't just one exact match
                  (localUrl.trim() === "" ||
                    !(
                      filteredSuggestions.length === 1 &&
                      normalizeUrlInline(filteredSuggestions[0].url) ===
                        normalizeUrlInline(localUrl)
                    )) && (
                    <div
                      style={dropdownStyle}
                      className="absolute top-full left-0 right-0 mt-[2px] bg-white border border-neutral-300 shadow-md rounded-md z-50 max-h-48 overflow-y-auto font-geneva-12"
                      data-dropdown-content
                    >
                      {filteredSuggestions.map((suggestion, index) => (
                        <div
                          key={`${suggestion.type}-${index}`}
                          className={`px-2 py-1.5 hover:bg-gray-100 focus:bg-gray-200 cursor-pointer flex items-center gap-2 text-sm outline-none ${
                            index === selectedSuggestionIndex
                              ? "bg-gray-200"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedSuggestionIndex(index);
                            if (suggestion.type === "search") {
                              const searchQuery = suggestion.url.substring(5); // Remove "bing:"
                              handleNavigateWithHistory(
                                `https://www.bing.com/search?q=${encodeURIComponent(
                                  searchQuery
                                )}`,
                                "current"
                              );
                            } else {
                              handleNavigateWithHistory(
                                suggestion.url,
                                suggestion.year
                              );
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (suggestion.type === "search") {
                                const searchQuery = suggestion.url.substring(5); // Remove "bing:"
                                handleNavigateWithHistory(
                                  `https://www.bing.com/search?q=${encodeURIComponent(
                                    searchQuery
                                  )}`,
                                  "current"
                                );
                              } else {
                                handleNavigateWithHistory(
                                  suggestion.url,
                                  suggestion.year
                                );
                              }
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              const nextItem = e.currentTarget
                                .nextElementSibling as HTMLElement;
                              if (nextItem) {
                                setSelectedSuggestionIndex(index + 1);
                                nextItem.focus();
                              }
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              const prevItem = e.currentTarget
                                .previousElementSibling as HTMLElement;
                              if (prevItem) {
                                setSelectedSuggestionIndex(index - 1);
                                prevItem.focus();
                              } else urlInputRef.current?.focus();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setIsUrlDropdownOpen(false);
                              urlInputRef.current?.focus();
                            }
                          }}
                          onFocus={() => {
                            // Keep dropdown open when focus moves to dropdown items
                            setIsUrlDropdownOpen(true);
                            setSelectedSuggestionIndex(index);
                          }}
                          tabIndex={0}
                          data-dropdown-item
                        >
                          {suggestion.type === "search" ? (
                            <Search className="w-4 h-4 text-neutral-400" />
                          ) : (
                            <img
                              src={suggestion.favicon || "/icons/ie-site.png"}
                              alt=""
                              className="w-4 h-4"
                              onError={(e) => {
                                e.currentTarget.src = "/icons/ie-site.png";
                              }}
                            />
                          )}
                          <div className="flex-1 truncate">
                            <div className="font-medium font-geneva-12 text-[11px]">
                              {suggestion.title}
                              {suggestion.year &&
                                suggestion.year !== "current" && (
                                  <span className="font-normal text-gray-500 ml-1">
                                    ({suggestion.year})
                                  </span>
                                )}
                            </div>
                            <div className="font-geneva-12 text-[10px] text-gray-500 truncate">
                              {suggestion.type === "search"
                                ? "bing.com"
                                : stripProtocol(suggestion.url)}
                            </div>
                          </div>
                          <div className="font-geneva-12 text-[10px] ml-2 text-gray-500 whitespace-nowrap hidden sm:block">
                            {suggestion.type === "favorite" && "Favorite"}
                            {suggestion.type === "history" && "History"}
                            {suggestion.type === "search" && "Search"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTimeMachineViewOpen(true)}
                      disabled={
                        isFetchingCachedYears || cachedYears.length <= 1
                      }
                      className={`h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2 focus-visible:ring-0 focus-visible:ring-offset-0 ${
                        cachedYears.length > 1
                          ? ""
                          : "opacity-50 cursor-not-allowed"
                      }`}
                      aria-label="Show cached versions (Time Machine)"
                      style={{
                        pointerEvents:
                          cachedYears.length <= 1 ? "none" : "auto",
                      }}
                    >
                      <History
                        className={`h-4 w-4 ${
                          cachedYears.length > 1
                            ? "text-orange-500"
                            : "text-neutral-400"
                        }`}
                      />
                    </Button>
                  </TooltipTrigger>
                  {cachedYears.length > 1 && (
                    <TooltipContent side="bottom">
                      <p>
                        {cachedYears.length} Time Node
                        {cachedYears.length !== 1 ? "s" : ""}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={year}
                  onValueChange={(newYear) => handleNavigate(url, newYear)}
                >
                  <SelectTrigger className="!text-[16px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent className="px-0">
                    {futureYears.map((y) => (
                      <SelectItem
                        key={y}
                        value={y}
                        className="text-md h-6 px-3 active:bg-gray-900 active:text-white text-blue-600"
                      >
                        {y}
                      </SelectItem>
                    ))}
                    <SelectItem
                      value="current"
                      className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                    >
                      Now
                    </SelectItem>
                    {pastYears.map((y) => (
                      <SelectItem
                        key={y}
                        value={y}
                        className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                          parseInt(y) <= 1995 ? "text-blue-600" : ""
                        }`}
                      >
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="relative flex items-center">
              <div
                ref={favoritesContainerRef}
                className="overflow-x-auto scrollbar-none relative flex-1"
              >
                <div className="flex items-center min-w-full w-max">
                  {favorites.map((favorite, index) => {
                    // Check if the favorite is a folder
                    if (favorite.children && favorite.children.length > 0) {
                      return (
                        <DropdownMenu key={index}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                            >
                              <img
                                src={"/icons/directory.png"} // Folder icon
                                alt="Folder"
                                className="w-4 h-4 mr-1"
                              />
                              <span className="truncate">{favorite.title}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            sideOffset={4}
                            className="px-0 max-w-xs"
                            onCloseAutoFocus={(e) => e.preventDefault()}
                          >
                            {favorite.children.map((child) => (
                              <DropdownMenuItem
                                key={child.url}
                                onClick={() =>
                                  handleNavigateWithHistory(
                                    normalizeUrlForHistory(child.url!),
                                    child.year
                                  )
                                }
                                className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
                              >
                                <img
                                  src={child.favicon || "/icons/ie-site.png"}
                                  alt=""
                                  className="w-4 h-4"
                                  onError={(e) => {
                                    e.currentTarget.src = "/icons/ie-site.png";
                                  }}
                                />
                                {child.title}
                                {child.year && child.year !== "current" && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    ({child.year})
                                  </span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    } else if (favorite.url) {
                      // Render regular favorite button
                      return (
                        <Button
                          key={index}
                          variant="ghost"
                          size="sm"
                          className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                          onClick={(e) => {
                            const normalizedFavUrl = normalizeUrlForHistory(
                              favorite.url!
                            );
                            handleNavigateWithHistory(
                              normalizedFavUrl,
                              favorite.year
                            );
                            e.currentTarget.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                              inline: "nearest",
                            });
                          }}
                        >
                          <img
                            src={favorite.favicon || "/icons/ie-site.png"}
                            alt="Site"
                            className="w-4 h-4 mr-1"
                            onError={(e) => {
                              e.currentTarget.src = "/icons/ie-site.png";
                            }}
                          />
                          <span className="truncate">{favorite.title}</span>
                        </Button>
                      );
                    } else {
                      return null; // Should not happen
                    }
                  })}
                </div>
              </div>
              {favorites.length > 0 && hasMoreToScroll && (
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none" />
              )}
            </div>
          </div>

          <div className="flex-1 relative">
            {errorDetails ? (
              renderErrorPage()
            ) : isFutureYear ||
              (mode === "past" && (isAiLoading || aiGeneratedHtml !== null)) ? (
              <div className="w-full h-full overflow-hidden absolute inset-0 font-geneva-12">
                <HtmlPreview
                  htmlContent={
                    isAiLoading ? generatedHtml || "" : aiGeneratedHtml || ""
                  }
                  onInteractionChange={() => {}}
                  className="border-none"
                  maxHeight="none"
                  minHeight="100%"
                  initialFullScreen={false}
                  isInternetExplorer={true}
                  isStreaming={isAiLoading && generatedHtml !== aiGeneratedHtml}
                  playElevatorMusic={playElevatorMusic}
                  stopElevatorMusic={stopElevatorMusic}
                  playDingSound={playDingSound}
                  baseUrlForAiContent={url}
                  mode={mode}
                />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={finalUrl || ""}
                className="w-full h-full border-0"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            )}

            {!isForeground && (
              <div
                className="absolute inset-0 bg-transparent z-50"
                onClick={() => bringToForeground("internet-explorer")}
                onMouseDown={() => bringToForeground("internet-explorer")}
                onTouchStart={() => bringToForeground("internet-explorer")}
                onWheel={() => bringToForeground("internet-explorer")}
                onDragStart={() => bringToForeground("internet-explorer")}
                onKeyDown={() => bringToForeground("internet-explorer")}
              />
            )}

            <AnimatePresence>
              {(status === "loading" ||
                isAiLoading ||
                isFetchingWebsiteContent) && (
                <motion.div
                  className="absolute top-0 left-0 right-0 bg-white/75 backdrop-blur-sm overflow-hidden z-40"
                  variants={loadingBarVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  <div
                    className={`h-full ${
                      isAiLoading && mode === "past" && parseInt(year) <= 1995
                        ? "animate-progress-indeterminate-orange-reverse"
                        : isAiLoading
                        ? "animate-progress-indeterminate-orange"
                        : isFetchingWebsiteContent && mode === "past"
                        ? "animate-progress-indeterminate-green-reverse"
                        : isFetchingWebsiteContent
                        ? "animate-progress-indeterminate-green"
                        : mode === "past" && !isAiLoading
                        ? "animate-progress-indeterminate-reverse"
                        : "animate-progress-indeterminate"
                    }`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {(status === "loading" ||
              (isAiLoading && generatedHtml !== aiGeneratedHtml) ||
              isFetchingWebsiteContent) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-0 left-0 right-0 bg-gray-100 border-t border-black font-geneva-12 text-[10px] px-2 py-1 flex items-center z-50"
              >
                <div className="flex-1 truncate">{getDebugStatusMessage()}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <InputDialog
          isOpen={isTitleDialogOpen}
          onOpenChange={setTitleDialogOpen}
          onSubmit={handleTitleSubmit}
          title="Add Favorite"
          description="Enter a title for this favorite"
          value={newFavoriteTitle}
          onChange={setNewFavoriteTitle}
        />
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setHelpDialogOpen}
          helpItems={helpItems || []}
          appName="Internet Explorer"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearFavoritesDialogOpen}
          onOpenChange={setClearFavoritesDialogOpen}
          onConfirm={handleClearFavorites}
          title="Clear Favorites"
          description="Are you sure you want to clear all favorites?"
        />
        <ConfirmDialog
          isOpen={isClearHistoryDialogOpen}
          onOpenChange={setClearHistoryDialogOpen}
          onConfirm={() => {
            clearHistory();
            setClearHistoryDialogOpen(false);
          }}
          title="Clear History"
          description="Are you sure you want to clear all history?"
        />
        <ConfirmDialog
          isOpen={isResetFavoritesDialogOpen}
          onOpenChange={setResetFavoritesDialogOpen}
          onConfirm={handleResetFavorites}
          title="Reset Favorites"
          description="Are you sure you want to reset favorites to default?"
        />
        <FutureSettingsDialog
          isOpen={isFutureSettingsDialogOpen}
          onOpenChange={setFutureSettingsDialogOpen}
        />
        <TimeMachineView
          isOpen={isTimeMachineViewOpen}
          onClose={() => setTimeMachineViewOpen(false)}
          cachedYears={chronologicallySortedYears}
          currentUrl={url}
          currentSelectedYear={year}
          onSelectYear={(selectedYear) => {
            handleNavigate(url, selectedYear);
          }}
        />
      </WindowFrame>

      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="Page"
        itemIdentifier={url}
        secondaryIdentifier={year}
        title={currentPageTitle || url} // Use page title or URL as title
        generateShareUrl={ieGenerateShareUrl}
      />
    </TooltipProvider>
  );
}
