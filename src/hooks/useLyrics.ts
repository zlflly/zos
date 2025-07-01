import { useEffect, useState, useRef, useCallback } from "react";
import { LyricLine } from "@/types/lyrics";
import { parseLRC } from "@/utils/lrcParser";
import { useIpodStore } from "@/stores/useIpodStore";

interface UseLyricsParams {
  /** Song title */
  title?: string;
  /** Song artist */
  artist?: string;
  /** Song album */
  album?: string;
  /** Current playback time in seconds */
  currentTime: number;
  /** Target language for translation (e.g., "en", "es", "ja"). If null or undefined, no translation. */
  translateTo?: string | null;
}

interface LyricsState {
  lines: LyricLine[];
  currentLine: number;
  isLoading: boolean; // True when fetching original LRC
  isTranslating: boolean; // True when translating lyrics
  error?: string;
  updateCurrentTimeManually: (newTimeInSeconds: number) => void; // Added function to manually update time
}

/**
 * Fetch timed lyrics (LRC) for a given song, optionally translate them,
 * and keep track of which line is currently active based on playback time.
 * Returns the parsed lyric lines and the index of the current line.
 */
export function useLyrics({
  title = "",
  artist = "",
  album = "",
  currentTime,
  translateTo,
}: UseLyricsParams): LyricsState {
  const [originalLines, setOriginalLines] = useState<LyricLine[]>([]);
  const [translatedLines, setTranslatedLines] = useState<LyricLine[] | null>(
    null
  );
  const [currentLine, setCurrentLine] = useState(-1);
  const [isFetchingOriginal, setIsFetchingOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const cachedKeyRef = useRef<string | null>(null);
  // Add a ref to store the last computed time for manual updates
  const lastTimeRef = useRef<number>(currentTime);

  // Effect for fetching original lyrics
  useEffect(() => {
    setOriginalLines([]);
    setTranslatedLines(null);
    setCurrentLine(-1);
    setIsFetchingOriginal(true);
    setIsTranslating(false); // Reset translation state
    setError(undefined);

    if (!title && !artist && !album) {
      setIsFetchingOriginal(false);
      return;
    }

    const cacheKey = `${title}__${artist}__${album}`;
    if (cacheKey === cachedKeyRef.current) {
      // If original lyrics are cached, we might still need to translate if translateTo changed.
      // The translation effect will handle this.
      setIsFetchingOriginal(false); // Not fetching if original is cached
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn("Lyrics fetch timed out");
    }, 15000);

    fetch("/api/lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist, album }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          if (res.status === 404 || controller.signal.aborted) return null;
          throw new Error(`Failed to fetch lyrics (status ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json) throw new Error("No lyrics found or fetch timed out");

        const lrc: string | undefined = json?.lyrics;
        if (!lrc) throw new Error("No lyrics found");

        const cleanedLrc = lrc.replace(/\u200b/g, "");
        const parsed = parseLRC(
          cleanedLrc,
          json?.title ?? title,
          json?.artist ?? artist
        );
        setOriginalLines(parsed);
        cachedKeyRef.current = cacheKey;

        // Update iPod store with current lyrics
        useIpodStore.setState({ currentLyrics: { lines: parsed } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("useLyrics original fetch error", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Lyrics search timed out.");
        } else {
          setError(
            err instanceof Error ? err.message : "Unknown error fetching lyrics"
          );
        }
        setOriginalLines([]);
        setCurrentLine(-1);
        // Clear lyrics in iPod store on error
        useIpodStore.setState({ currentLyrics: null });
      })
      .finally(() => {
        if (!cancelled) setIsFetchingOriginal(false);
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [title, artist, album]);

  // Effect for translating lyrics
  useEffect(() => {
    if (!translateTo || originalLines.length === 0) {
      setTranslatedLines(null);
      setIsTranslating(false);
      if (translateTo && originalLines.length > 0) {
        // This case should be handled by originalLines fetch completing first.
        // If originalLines is empty and translateTo is set, it means we are waiting for original fetch or original fetch failed.
      }
      return;
    }

    // If original fetch is still in progress, wait for it.
    if (isFetchingOriginal) {
      setIsTranslating(false); // Not yet translating
      return;
    }

    let cancelled = false;
    setIsTranslating(true);
    setError(undefined); // Clear previous errors

    const controller = new AbortController();
    const translationTimeoutId = setTimeout(() => {
      controller.abort();
      console.warn("Lyrics translation timed out");
    }, 40000);

    fetch("/api/translate-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: originalLines,
        targetLanguage: translateTo,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(translationTimeoutId);
        const responseText = await res.text();
        if (!res.ok) {
          const errorMessage = responseText.startsWith("Error: ")
            ? responseText.substring(7)
            : responseText;
          throw new Error(
            errorMessage ||
              `Translation request failed with status ${res.status}`
          );
        }
        return responseText;
      })
      .then((lrcText) => {
        if (cancelled) return;
        if (lrcText) {
          const parsedTranslatedLines = parseLRC(lrcText, title, artist);
          setTranslatedLines(parsedTranslatedLines);
          // Do NOT overwrite currentLyrics in the store so that it continues
          // to hold the original (untranslated) lyrics. This ensures that
          // other features such as AI chat receive the unmodified lyrics.
        } else {
          // If translation returns empty we still keep original in the store.
          setTranslatedLines([]);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("useLyrics translation error", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Lyrics translation timed out.");
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unknown error during translation"
          );
        }
        setTranslatedLines(null);
        // Keep original lyrics in iPod store on translation error
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
        clearTimeout(translationTimeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(translationTimeoutId);
    };
  }, [originalLines, translateTo, isFetchingOriginal, title, artist]);

  const displayLines = translatedLines || originalLines;

  // Function to calculate the current line based on a given time
  const calculateCurrentLine = useCallback(
    (timeInSeconds: number) => {
      if (!displayLines.length) return -1;

      const timeMs = timeInSeconds * 1000;
      let idx = displayLines.findIndex((line, i) => {
        const nextLineStart =
          i + 1 < displayLines.length
            ? parseInt(displayLines[i + 1].startTimeMs)
            : Infinity;
        return timeMs >= parseInt(line.startTimeMs) && timeMs < nextLineStart;
      });

      if (
        idx === -1 &&
        displayLines.length > 0 &&
        timeMs >= parseInt(displayLines[displayLines.length - 1].startTimeMs)
      ) {
        idx = displayLines.length - 1;
      }

      return idx;
    },
    [displayLines]
  );

  // Update current line based on displayed lines and current time
  useEffect(() => {
    lastTimeRef.current = currentTime;
    setCurrentLine(calculateCurrentLine(currentTime));
  }, [currentTime, calculateCurrentLine]);

  // Function to manually update the current time
  const updateCurrentTimeManually = useCallback(
    (newTimeInSeconds: number) => {
      lastTimeRef.current = newTimeInSeconds;
      setCurrentLine(calculateCurrentLine(newTimeInSeconds));
    },
    [calculateCurrentLine]
  );

  return {
    lines: displayLines,
    currentLine,
    isLoading: isFetchingOriginal,
    isTranslating,
    error,
    updateCurrentTimeManually,
  };
}
