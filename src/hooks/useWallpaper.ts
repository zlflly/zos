import { useMemo, useEffect, useRef } from "react";
import { useAppStore, INDEXEDDB_PREFIX } from "@/stores/useAppStore";

/**
 * Hook exposing wallpaper state & helpers.
 * Under the hood, all state is managed by the global `useAppStore`.
 */
export function useWallpaper() {
  // State selectors
  const currentWallpaper = useAppStore((s) => s.currentWallpaper);
  const wallpaperSource = useAppStore((s) => s.wallpaperSource);

  // Actions
  const setWallpaper = useAppStore((s) => s.setWallpaper);
  const loadCustomWallpapers = useAppStore((s) => s.loadCustomWallpapers);
  const getWallpaperData = useAppStore((s) => s.getWallpaperData);

  // Derived helper – detects whether the active wallpaper is a video
  const isVideoWallpaper = useMemo(() => {
    const path = wallpaperSource;
    return (
      path.endsWith(".mp4") ||
      path.includes("video/") ||
      (path.startsWith("https://") && /\.(mp4|webm|ogg)(\?|$)/.test(path))
    );
  }, [wallpaperSource]);

  // Ensure wallpaperSource is correctly resolved on first mount for custom wallpapers.
  // We attempt a single refresh per session if the persisted `wallpaperSource` might be stale
  // (e.g. an old `blob:` URL that no longer exists after a full page reload).
  const hasAttemptedRefresh = useRef(false);

  useEffect(() => {
    if (hasAttemptedRefresh.current) return;

    const isCustom = currentWallpaper.startsWith(INDEXEDDB_PREFIX);
    const sourceLooksStale =
      wallpaperSource === currentWallpaper || // Not resolved yet
      wallpaperSource.startsWith("blob:"); // Could be an invalid Object URL after reload

    if (isCustom && sourceLooksStale) {
      hasAttemptedRefresh.current = true; // Avoid infinite loops
      void setWallpaper(currentWallpaper);
    }
  }, [currentWallpaper, wallpaperSource, setWallpaper]);

  return {
    currentWallpaper,
    wallpaperSource,
    setWallpaper,
    isVideoWallpaper,
    loadCustomWallpapers,
    getWallpaperData,
    INDEXEDDB_PREFIX,
  } as const;
}
