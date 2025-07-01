import React from "react";

export interface AppProps<TInitialData = unknown> {
  onClose: () => void;
  isWindowOpen: boolean;
  isForeground?: boolean;
  className?: string;
  skipInitialSound?: boolean;
  initialData?: TInitialData;
  helpItems?: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  // Instance-specific props (optional for backward compatibility)
  instanceId?: string;
  title?: string;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
}

export interface BaseApp<TInitialData = unknown> {
  id:
    | "soundboard"
    | "internet-explorer"
    | "chats"
    | "textedit"
    | "control-panels"
    | "minesweeper"
    | "finder"
    | "paint"
    | "videos"
    | "pc"
    | "photo-booth"
    | "synth"
    | "ipod"
    | "terminal";
  name: string;
  icon: string | { type: "image"; src: string };
  description: string;
  component: React.ComponentType<AppProps<TInitialData>>;
  windowConstraints?: {
    minWidth?: number | string;
    minHeight?: number | string;
    maxWidth?: number | string;
    maxHeight?: number | string;
  };
  helpItems?: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  metadata?: {
    name: string;
    version: string;
    creator: {
      name: string;
      url: string;
    };
    github: string;
    icon: string;
  };
}

export interface AppState<TInitialData = unknown> {
  isOpen: boolean;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  isForeground?: boolean;
  initialData?: TInitialData;
}

export interface AppManagerState {
  windowOrder: string[];
  apps: {
    [appId: string]: AppState;
  };
}

// App-specific initial data types
export interface ControlPanelsInitialData {
  defaultTab?: string;
}

export interface InternetExplorerInitialData {
  shareCode?: string;
  url?: string;
  year?: string;
}

export interface IpodInitialData {
  videoId?: string;
}

export interface PaintInitialData {
  path?: string;
  content?: Blob;
}

export interface VideosInitialData {
  videoId?: string;
}

export interface FinderInitialData {
  path?: string;
}

// Union type for all possible app configurations
export type AnyApp =
  | BaseApp<ControlPanelsInitialData>
  | BaseApp<InternetExplorerInitialData>
  | BaseApp<IpodInitialData>
  | BaseApp<PaintInitialData>
  | BaseApp<VideosInitialData>
  | BaseApp<unknown>; // For apps without specific initialData

// Type for the initialData that could be any of the specific types
export type AnyInitialData =
  | ControlPanelsInitialData
  | InternetExplorerInitialData
  | IpodInitialData
  | PaintInitialData
  | VideosInitialData
  | FinderInitialData
  | unknown;
