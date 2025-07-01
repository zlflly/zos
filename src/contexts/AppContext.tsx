import { createContext, useContext } from "react";
import { AnyApp, AppState, AnyInitialData } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";

interface AppContextType {
  appStates: { [appId: string]: AppState };
  toggleApp: (appId: AppId, initialData?: AnyInitialData) => void;
  bringToForeground: (appId: AppId) => void;
  apps: AnyApp[];
  navigateToNextApp: (currentAppId: AppId) => void;
  navigateToPreviousApp: (currentAppId: AppId) => void;
}

export const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppContext must be used within AppProvider");
  return context;
}
