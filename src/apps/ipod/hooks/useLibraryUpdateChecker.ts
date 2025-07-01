import { useEffect, useRef } from "react";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { toast } from "sonner";

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

export function useLibraryUpdateChecker(isActive: boolean) {
  const syncLibrary = useIpodStore((state) => state.syncLibrary);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      // Clear interval when app is not active
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const checkForUpdates = async () => {
      try {
        // Do track-based comparison like manual sync, not version-based
        // This avoids timing issues where version might already be updated
        const currentTracks = useIpodStore.getState().tracks;
        const wasEmpty = currentTracks.length === 0;

        // Get server tracks directly (same as syncLibrary does)
        const res = await fetch("/data/ipod-videos.json");
        const data = await res.json();
        const serverTracks: Track[] = (data.videos || data).map(
          (v: Record<string, unknown>) => ({
            id: v.id as string,
            url: v.url as string,
            title: v.title as string,
            artist: v.artist as string | undefined,
            album: (v.album as string | undefined) ?? "",
            lyricOffset: v.lyricOffset as number | undefined,
          })
        );
        const serverVersion = data.version || 1;

        // Check for new tracks (same logic as syncLibrary)
        const existingIds = new Set(currentTracks.map((track) => track.id));
        const newTracksCount = serverTracks.filter(
          (track) => !existingIds.has(track.id)
        ).length;

        // Check for metadata updates
        let tracksUpdated = 0;
        const serverTrackMap = new Map(
          serverTracks.map((track) => [track.id, track])
        );
        currentTracks.forEach((currentTrack) => {
          const serverTrack = serverTrackMap.get(currentTrack.id);
          if (serverTrack) {
            const hasChanges =
              currentTrack.title !== serverTrack.title ||
              currentTrack.artist !== serverTrack.artist ||
              currentTrack.album !== serverTrack.album ||
              currentTrack.url !== serverTrack.url ||
              currentTrack.lyricOffset !== serverTrack.lyricOffset;
            if (hasChanges) tracksUpdated++;
          }
        });

        console.log("[iPod] Auto update check:", {
          newTracksCount,
          tracksUpdated,
          currentTracksCount: currentTracks.length,
          serverTracksCount: serverTracks.length,
          serverVersion,
          currentLastKnownVersion: useIpodStore.getState().lastKnownVersion,
        });

        if (newTracksCount > 0 || tracksUpdated > 0) {
          // Auto-update: directly sync without asking user
          try {
            const result = await syncLibrary();
            const message =
              wasEmpty && result.newTracksAdded > 0
                ? `Added ${result.newTracksAdded} song${
                    result.newTracksAdded === 1 ? "" : "s"
                  } to the top. First song ready to play!`
                : result.newTracksAdded > 0
                ? `Auto-updated library: added ${
                    result.newTracksAdded
                  } new song${
                    result.newTracksAdded === 1 ? "" : "s"
                  } to the top${
                    result.tracksUpdated > 0
                      ? ` and updated ${result.tracksUpdated} track${
                          result.tracksUpdated === 1 ? "" : "s"
                        }`
                      : ""
                  }`
                : `Auto-updated ${result.tracksUpdated} track metadata`;

            toast.success("Library Auto-Updated", {
              description: message,
              duration: 4000,
            });

            console.log(
              `[iPod] Auto-updated: ${result.newTracksAdded} new tracks, ${result.tracksUpdated} updated tracks`
            );
          } catch (error) {
            console.error("Error auto-updating library:", error);
            toast.error("Auto-Update Failed", {
              description: "Failed to auto-update library",
              duration: 4000,
            });
          }
        }
      } catch (error) {
        console.error("Error checking for library updates:", error);
      }
    };

    // Always check immediately when app becomes active (with a small delay to allow store to rehydrate)
    const immediateCheckTimeout = setTimeout(() => {
      console.log(
        "[iPod] Running immediate library update check on app activation"
      );
      checkForUpdates();
      lastCheckedRef.current = Date.now();
    }, 100);

    // Set up periodic checking
    intervalRef.current = setInterval(() => {
      checkForUpdates();
      lastCheckedRef.current = Date.now();
    }, CHECK_INTERVAL);

    return () => {
      clearTimeout(immediateCheckTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, syncLibrary]);

  // Manual check function that can be called externally
  const manualCheck = async () => {
    try {
      const wasEmptyBefore = useIpodStore.getState().tracks.length === 0;
      const result = await syncLibrary();

      if (result.newTracksAdded > 0 || result.tracksUpdated > 0) {
        const message =
          wasEmptyBefore && result.newTracksAdded > 0
            ? `Added ${result.newTracksAdded} song${
                result.newTracksAdded === 1 ? "" : "s"
              } to the top. First song ready to play!`
            : `Added ${result.newTracksAdded} new song${
                result.newTracksAdded === 1 ? "" : "s"
              } to the top${
                result.tracksUpdated > 0
                  ? ` and updated ${result.tracksUpdated} track${
                      result.tracksUpdated === 1 ? "" : "s"
                    }`
                  : ""
              }`;

        toast.success("Library Updated", {
          description: message,
        });
        return true;
      } else {
        toast.info("No Updates", {
          description: "Your library is already up to date",
        });
        return false;
      }
    } catch (error) {
      console.error("Error during manual library update check:", error);
      toast.error("Update Check Failed", {
        description: "Failed to check for library updates",
      });
      return false;
    }
  };

  // Manual sync function that syncs with server library
  const manualSync = async () => {
    try {
      const wasEmptyBefore = useIpodStore.getState().tracks.length === 0;
      const result = await syncLibrary();

      if (result.newTracksAdded > 0 || result.tracksUpdated > 0) {
        const message =
          wasEmptyBefore && result.newTracksAdded > 0
            ? `Added ${result.newTracksAdded} song${
                result.newTracksAdded === 1 ? "" : "s"
              } to the top. First song ready to play!`
            : `Added ${result.newTracksAdded} new song${
                result.newTracksAdded === 1 ? "" : "s"
              } to the top${
                result.tracksUpdated > 0
                  ? ` and updated ${result.tracksUpdated} track${
                      result.tracksUpdated === 1 ? "" : "s"
                    }`
                  : ""
              }. Total: ${result.totalTracks} songs`;

        toast.success("Library Synced", {
          description: message,
        });
      } else {
        toast.info("Library Synced", {
          description: `Library is up to date with ${result.totalTracks} songs`,
        });
      }
      return true;
    } catch (error) {
      console.error("Error during library sync:", error);
      toast.error("Sync Failed", {
        description: "Failed to sync with server library",
      });
      return false;
    }
  };

  return { manualCheck, manualSync };
}
