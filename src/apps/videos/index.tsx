import { BaseApp, VideosInitialData } from "../base/types";
import { VideosAppComponent } from "./components/VideosAppComponent";

export const helpItems = [
  {
    icon: "🎥",
    title: "Add Video",
    description: "Paste any YouTube URL to add to playlist",
  },
  {
    icon: "▶️",
    title: "Playback",
    description: "Play, pause, next, previous controls",
  },
  {
    icon: "🔁",
    title: "Loop",
    description: "Loop current video or entire playlist",
  },
  {
    icon: "🔀",
    title: "Shuffle",
    description: "Randomize playlist order",
  },
  {
    icon: "📝",
    title: "Playlist",
    description: "Manage and organize your video playlist",
  },
  {
    icon: "🎨",
    title: "Retro UI",
    description: "Classic QuickTime player aesthetics",
  },
];

export const appMetadata = {
  name: "Videos",
  version: "0.1",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/videos.png",
};

export const VideosApp: BaseApp<VideosInitialData> = {
  id: "videos",
  name: "Videos",
  icon: { type: "image", src: "/icons/videos.png" },
  description: "A retro-style YouTube playlist player",
  component: VideosAppComponent,
  helpItems,
  metadata: appMetadata,
};
