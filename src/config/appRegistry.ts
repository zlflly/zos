import { TextEditApp } from "@/apps/textedit";
import ControlPanelsApp from "@/apps/control-panels";
import { FinderApp } from "@/apps/finder";
import { IpodApp } from "@/apps/ipod";
import { appIds } from "./appIds";
import type {
  BaseApp,
  ControlPanelsInitialData,
  IpodInitialData,
} from "@/apps/base/types";

export type AppId = (typeof appIds)[number];

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowConstraints {
  minSize?: WindowSize;
  maxSize?: WindowSize;
  defaultSize: WindowSize;
  mobileDefaultSize?: WindowSize;
}

// Default window constraints for any app not specified
const defaultWindowConstraints: WindowConstraints = {
  defaultSize: { width: 730, height: 475 },
  minSize: { width: 300, height: 200 },
};

// Registry of all available apps with their window configurations
export const appRegistry = {
  [FinderApp.id]: {
    ...FinderApp,
    windowConfig: {
      defaultSize: { width: 400, height: 300 },
      minSize: { width: 300, height: 200 },
    } as WindowConstraints,
  },
  [TextEditApp.id]: {
    ...TextEditApp,
    windowConfig: {
      defaultSize: { width: 388, height: 475 },
      minSize: { width: 388, height: 200 },
    } as WindowConstraints,
  },
  [IpodApp.id]: {
    ...(IpodApp as BaseApp<IpodInitialData>),
    windowConfig: {
      defaultSize: { width: 300, height: 480 },
      minSize: { width: 300, height: 480 },
    } as WindowConstraints,
  },
  [ControlPanelsApp.id]: {
    ...(ControlPanelsApp as BaseApp<ControlPanelsInitialData>),
    windowConfig: {
      defaultSize: { width: 365, height: 415 },
      minSize: { width: 320, height: 415 },
      maxSize: { width: 365, height: 600 },
    } as WindowConstraints,
  },
} as const;

// Helper function to get app icon path
export const getAppIconPath = (appId: AppId): string => {
  const app = appRegistry[appId];
  if (typeof app.icon === "string") {
    return app.icon;
  }
  return app.icon.src;
};

// Helper function to get all apps except Finder
export const getNonFinderApps = (): Array<{
  name: string;
  icon: string;
  id: AppId;
}> => {
  return Object.entries(appRegistry)
    .filter(([id]) => id !== "finder")
    .map(([id, app]) => ({
      name: app.name,
      icon: getAppIconPath(id as AppId),
      id: id as AppId,
    }));
};

// Helper function to get app metadata
export const getAppMetadata = (appId: AppId) => {
  return appRegistry[appId].metadata;
};

// Helper function to get app component
export const getAppComponent = (appId: AppId) => {
  return appRegistry[appId].component;
};

// Helper function to get window configuration
export const getWindowConfig = (appId: AppId): WindowConstraints => {
  return appRegistry[appId].windowConfig || defaultWindowConstraints;
};

// Helper function to get mobile window size
export const getMobileWindowSize = (appId: AppId): WindowSize => {
  const config = getWindowConfig(appId);
  if (config.mobileDefaultSize) {
    return config.mobileDefaultSize;
  }
  return {
    width: window.innerWidth,
    height: config.defaultSize.height,
  };
};
