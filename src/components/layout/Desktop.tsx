import { AnyApp } from "@/apps/base/types";
import { AppManagerState } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";
import { useState, useEffect, useRef } from "react";
import { FileIcon } from "@/apps/finder/components/FileIcon";
import { getAppIconPath } from "@/config/appRegistry";
import { useWallpaper } from "@/hooks/useWallpaper";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { SortType } from "@/apps/finder/components/FinderMenuBar";
import { useLongPress } from "@/hooks/useLongPress";

interface DesktopStyles {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  transition?: string;
}

interface DesktopProps {
  apps: AnyApp[];
  appStates: AppManagerState;
  toggleApp: (appId: AppId, initialData?: unknown) => void;
  onClick?: () => void;
  desktopStyles?: DesktopStyles;
}

export function Desktop({
  apps,
  toggleApp,
  onClick,
  desktopStyles,
}: DesktopProps) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sortType, setSortType] = useState<SortType>("name");
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // ------------------ Mobile long-press support ------------------
  // Show the desktop context menu after the user holds for 500 ms.
  const longPressHandlers = useLongPress((e) => {
    const touch = e.touches[0];
    setContextMenuPos({ x: touch.clientX, y: touch.clientY });
  });

  // Add visibility change and focus handlers to resume video playback
  useEffect(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const resumeVideoPlayback = async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        // If video has ended, reset it to the beginning
        if (video.ended) {
          video.currentTime = 0;
        }

        // Only attempt to play if the video is ready
        if (video.readyState >= 3) {
          // HAVE_FUTURE_DATA or better
          await video.play();
        } else {
          // If video isn't ready, wait for it to be ready
          const handleCanPlay = () => {
            video.play().catch((err) => {
              console.warn("Could not resume video playback:", err);
            });
            video.removeEventListener("canplay", handleCanPlay);
          };
          video.addEventListener("canplay", handleCanPlay);
        }
      } catch (err) {
        console.warn("Could not resume video playback:", err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeVideoPlayback();
      }
    };

    const handleFocus = () => {
      resumeVideoPlayback();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isVideoWallpaper]);

  // Add video ready state handling
  useEffect(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const video = videoRef.current;
    const handleCanPlayThrough = () => {
      if (video.paused) {
        video.play().catch((err) => {
          console.warn("Could not start video playback:", err);
        });
      }
    };

    video.addEventListener("canplaythrough", handleCanPlayThrough);
    return () => {
      video.removeEventListener("canplaythrough", handleCanPlayThrough);
    };
  }, [isVideoWallpaper]);

  const getWallpaperStyles = (path: string): DesktopStyles => {
    if (!path || isVideoWallpaper) return {};

    const isTiled = path.includes("/wallpapers/tiles/");
    return {
      backgroundImage: `url(${path})`,
      backgroundSize: isTiled ? "64px 64px" : "cover",
      backgroundRepeat: isTiled ? "repeat" : "no-repeat",
      backgroundPosition: "center",
      transition: "background-image 0.3s ease-in-out",
    };
  };

  const finalStyles = {
    ...getWallpaperStyles(wallpaperSource),
    ...desktopStyles,
  };

  const handleIconClick = (
    appId: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
    setSelectedAppId(appId);
  };

  const handleFinderOpen = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    localStorage.setItem("app_finder_initialPath", "/");
    const finderApp = apps.find((app) => app.id === "finder");
    if (finderApp) {
      toggleApp(finderApp.id);
    }
    setSelectedAppId(null);
  };

  // Compute sorted apps based on selected sort type
  const sortedApps = [...apps]
    .filter((app) => app.id !== "finder" && app.id !== "control-panels")
    .sort((a, b) => {
      switch (sortType) {
        case "name":
          return a.name.localeCompare(b.name);
        case "kind":
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });

  const desktopMenuItems: MenuItem[] = [
    {
      type: "submenu",
      label: "Sort By",
      items: [
        {
          type: "radioGroup",
          value: sortType,
          onChange: (val) => setSortType(val as SortType),
          items: [
            { label: "Name", value: "name" },
            { label: "Kind", value: "kind" },
          ],
        },
      ],
    },
    { type: "separator" },
    {
      type: "item",
      label: "Set Wallpaper…",
      onSelect: () => toggleApp("control-panels"),
    },
  ];

  return (
    <div
      className="absolute inset-0 min-h-screen h-full z-[-1] desktop-background"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
      style={finalStyles}
      {...longPressHandlers}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-[-10]"
        src={wallpaperSource}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        data-webkit-playsinline="true"
        style={{
          display: isVideoWallpaper ? "block" : "none",
        }}
      />
      <div className="pt-8 p-4 flex flex-col items-end h-[calc(100%-2rem)] relative z-[1]">
        <div className="flex flex-col flex-wrap-reverse justify-start gap-1 content-start h-full">
          <FileIcon
            name="Macintosh HD"
            isDirectory={true}
            icon="/icons/disk.png"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAppId("macintosh-hd");
            }}
            onDoubleClick={handleFinderOpen}
            isSelected={selectedAppId === "macintosh-hd"}
            size="large"
          />
          {sortedApps.map((app) => (
            <FileIcon
              key={app.id}
              name={app.name}
              isDirectory={false}
              icon={getAppIconPath(app.id)}
              onClick={(e) => handleIconClick(app.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                toggleApp(app.id);
                setSelectedAppId(null);
              }}
              isSelected={selectedAppId === app.id}
              size="large"
            />
          ))}
        </div>
      </div>
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={desktopMenuItems}
      />
    </div>
  );
}
