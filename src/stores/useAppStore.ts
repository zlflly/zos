import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId, getWindowConfig } from "@/config/appRegistry";
import { appIds } from "@/config/appIds";
import { AppManagerState, AppState } from "@/apps/base/types";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ShaderType } from "@/components/shared/GalaxyBackground";
import { DisplayMode } from "@/utils/displayMode";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
// Re-export for backward compatibility


// Add new types for instance management
export interface AppInstance extends AppState {
  instanceId: string;
  appId: AppId;
  title?: string; // For window title customization
}

export interface AppInstanceManagerState {
  instances: Record<string, AppInstance>; // instanceId -> instance
  windowOrder: string[]; // Now contains instanceIds instead of appIds
  nextInstanceId: number;
}

const getInitialState = (): AppManagerState => {
  const apps: { [appId: string]: AppState } = appIds.reduce(
    (acc: { [appId: string]: AppState }, id) => {
      acc[id] = { isOpen: false };
      return acc;
    },
    {} as { [appId: string]: AppState }
  );

  return {
    windowOrder: [],
    apps,
  };
};

export interface AppStoreState extends AppManagerState {
  // Add instance management
  instances: Record<string, AppInstance>;
  instanceWindowOrder: string[];
  nextInstanceId: number;

  // Add version tracking
  version: number;

  // Instance management methods
  createAppInstance: (
    appId: AppId,
    initialData?: unknown,
    title?: string
  ) => string;
  closeAppInstance: (instanceId: string) => void;
  bringInstanceToForeground: (instanceId: string) => void;
  updateInstanceWindowState: (
    instanceId: string,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  getInstancesByAppId: (appId: AppId) => AppInstance[];
  getForegroundInstance: () => AppInstance | null;
  navigateToNextInstance: (currentInstanceId: string) => void;
  navigateToPreviousInstance: (currentInstanceId: string) => void;
  launchApp: (
    appId: AppId,
    initialData?: unknown,
    title?: string,
    multiWindow?: boolean
  ) => string;

  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
  selectedShaderType: ShaderType;
  setSelectedShaderType: (shaderType: ShaderType) => void;
  uiSoundsEnabled: boolean;
  setUiSoundsEnabled: (enabled: boolean) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  updateWindowState: (
    appId: AppId,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  bringToForeground: (appId: AppId | "") => void;
  toggleApp: (appId: AppId, initialData?: unknown) => void;
  closeApp: (appId: AppId) => void;
  navigateToNextApp: (currentAppId: AppId) => void;
  navigateToPreviousApp: (currentAppId: AppId) => void;
  clearInitialData: (appId: AppId) => void;
  clearInstanceInitialData: (instanceId: string) => void;
  launchOrFocusApp: (appId: AppId, initialData?: unknown) => void;
  currentWallpaper: string;
  setCurrentWallpaper: (wallpaperPath: string) => void;
  wallpaperSource: string;
  setWallpaper: (path: string | File) => Promise<void>;
  loadCustomWallpapers: () => Promise<string[]>;
  getWallpaperData: (reference: string) => Promise<string | null>;
  isFirstBoot: boolean;
  setHasBooted: () => void;
  uiVolume: number;
  setUiVolume: (vol: number) => void;
  ipodVolume: number;
  setIpodVolume: (vol: number) => void;
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
}

// Define current store version
const CURRENT_APP_STORE_VERSION = 2; // Increment to trigger TTS migration

// Run the check once on script load
const initialShaderState = checkShaderPerformance();

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      // Add version tracking
      version: CURRENT_APP_STORE_VERSION,

      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),
      shaderEffectEnabled: initialShaderState,
      setShaderEffectEnabled: (enabled) =>
        set({ shaderEffectEnabled: enabled }),
      selectedShaderType: ShaderType.AURORA,
      setSelectedShaderType: (shaderType) =>
        set({ selectedShaderType: shaderType }),
      uiSoundsEnabled: true,
      setUiSoundsEnabled: (enabled) => set({ uiSoundsEnabled: enabled }),
      displayMode: "color",
      setDisplayMode: (mode) => set({ displayMode: mode }),
      isFirstBoot: true,
      setHasBooted: () => {
        set({ isFirstBoot: false });
      },
      uiVolume: 1,
      setUiVolume: (vol) => set({ uiVolume: vol }),
      ipodVolume: 1,
      setIpodVolume: (vol) => set({ ipodVolume: vol }),
      masterVolume: 1,
      setMasterVolume: (vol) => set({ masterVolume: vol }),
      updateWindowState: (appId, position, size) =>
        set((state) => ({
          apps: {
            ...state.apps,
            [appId]: {
              ...state.apps[appId],
              position,
              size,
            },
          },
        })),
      currentWallpaper: "/public/wallpapers/photos/landscapes/clouds.jpg", // Default wallpaper
      wallpaperSource: "/public/wallpapers/photos/landscapes/clouds.jpg",
      setCurrentWallpaper: (wallpaperPath) =>
        set({
          currentWallpaper: wallpaperPath,
          wallpaperSource: wallpaperPath,
        }),

      // High-level helper to change wallpaper (string path or File)
      setWallpaper: async (path) => {
        let wallpaperPath: string;

        // 1. If user passed a File -> save it first
        if (path instanceof File) {
          try {
            wallpaperPath = await saveCustomWallpaper(path);
          } catch (err) {
            console.error("setWallpaper: failed to save custom wallpaper", err);
            return;
          }
        } else {
          wallpaperPath = path;
        }

        // 2. Update store with new path (optimistically)
        set({
          currentWallpaper: wallpaperPath,
          wallpaperSource: wallpaperPath,
        });

        // 3. If it is an IndexedDB reference, load actual data
        if (wallpaperPath.startsWith(INDEXEDDB_PREFIX)) {
          const data = await get().getWallpaperData(wallpaperPath);
          if (data) {
            set({ wallpaperSource: data });
          }
        }

        // 4. Inform rest of application (for same-window listeners)
        window.dispatchEvent(
          new CustomEvent("wallpaperChange", { detail: wallpaperPath })
        );
      },

      // Return references (indexeddb://<id>) of all saved custom wallpapers
      loadCustomWallpapers: async () => {
        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const keysRequest = store.getAllKeys();
          const refs: string[] = await new Promise((resolve, reject) => {
            keysRequest.onsuccess = () =>
              resolve(keysRequest.result as string[]);
            keysRequest.onerror = () => reject(keysRequest.error);
          });
          db.close();
          return refs.map((k) => `${INDEXEDDB_PREFIX}${k}`);
        } catch (err) {
          console.error("Error loading custom wallpapers:", err);
          return [];
        }
      },

      // Fetch the actual data (object URL or data URL) for a wallpaper reference
      getWallpaperData: async (reference) => {
        if (!reference.startsWith(INDEXEDDB_PREFIX)) {
          return reference; // Plain path
        }

        const id = reference.substring(INDEXEDDB_PREFIX.length);

        // Use cached URL if available
        if (objectURLs[id]) return objectURLs[id];

        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const req = store.get(id);

          const result = await new Promise<StoredWallpaper | null>(
            (resolve, reject) => {
              req.onsuccess = () => resolve(req.result as StoredWallpaper);
              req.onerror = () => reject(req.error);
            }
          );

          db.close();

          if (!result) return null;

          let objectURL: string | null = null;

          if (result.blob) {
            objectURL = URL.createObjectURL(result.blob);
          } else if (result.content) {
            const blob = dataURLToBlob(result.content);
            objectURL = blob ? URL.createObjectURL(blob) : result.content;
          }

          if (objectURL) {
            objectURLs[id] = objectURL;
            return objectURL;
          }

          return null;
        } catch (err) {
          console.error("Error getting wallpaper data:", err);
          return null;
        }
      },

      bringToForeground: (appId) => {
        set((state) => {
          const newState: AppManagerState = {
            windowOrder: [...state.windowOrder],
            apps: { ...state.apps },
          };

          // If empty string provided, just clear foreground flags
          if (!appId) {
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = { ...newState.apps[id], isForeground: false };
            });
          } else {
            // Re‑order windowOrder so that appId is last (top‑most)
            newState.windowOrder = [
              ...newState.windowOrder.filter((id) => id !== appId),
              appId,
            ];

            // Set foreground flags
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = {
                ...newState.apps[id],
                isForeground: id === appId,
              };
            });
          }

          // Emit DOM event (keep behaviour parity)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: newState.apps[appId]?.isOpen || false,
              isForeground: true,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      toggleApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];

          if (isCurrentlyOpen) {
            // Remove the app from window order
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
          } else {
            // Add the app to window order
            newWindowOrder = [...newWindowOrder, appId];
          }

          const newApps: { [appId: string]: AppState } = { ...state.apps };

          // If closing the app and there are other open apps, bring the most recent one to foreground
          const shouldBringPreviousToForeground =
            isCurrentlyOpen && newWindowOrder.length > 0;
          const previousAppId = shouldBringPreviousToForeground
            ? newWindowOrder[newWindowOrder.length - 1]
            : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: !isCurrentlyOpen,
                isForeground: !isCurrentlyOpen,
                initialData: !isCurrentlyOpen ? initialData : undefined,
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                isForeground:
                  shouldBringPreviousToForeground && id === previousAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: !isCurrentlyOpen,
              isForeground: !isCurrentlyOpen,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      closeApp: (appId) => {
        set((state) => {
          if (!state.apps[appId]?.isOpen) {
            console.log(`App ${appId} is already closed. No action taken.`);
            return state; // App is already closed, do nothing
          }

          console.log(`Closing app: ${appId}`);

          const newWindowOrder = state.windowOrder.filter((id) => id !== appId);
          const newApps: { [id: string]: AppState } = { ...state.apps };

          // Determine the next app to bring to foreground
          const nextForegroundAppId =
            newWindowOrder.length > 0
              ? newWindowOrder[newWindowOrder.length - 1]
              : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: false,
                isForeground: false,
                initialData: undefined, // Clear initial data on close
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                // Bring the next app in order to foreground if this wasn't the last app closed
                isForeground: id === nextForegroundAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit DOM event for closing
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: false,
              isForeground: false,
            },
          });
          window.dispatchEvent(appStateChangeEvent);
          console.log(`App ${appId} closed. New window order:`, newWindowOrder);
          console.log(
            `App ${nextForegroundAppId || "none"} brought to foreground.`
          );

          return newState;
        });
      },

      launchOrFocusApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];
          const newApps: { [id: string]: AppState } = { ...state.apps };

          console.log(
            `[AppStore:launchOrFocusApp] App: ${appId}, Currently Open: ${isCurrentlyOpen}, InitialData:`,
            initialData
          );

          if (isCurrentlyOpen) {
            // App is open: Bring to front, update initialData
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
            newWindowOrder.push(appId);
          } else {
            // App is closed: Add to end
            newWindowOrder.push(appId);
          }

          // Update all apps for foreground status and the target app's data/open state
          Object.keys(newApps).forEach((id) => {
            const isTargetApp = id === appId;
            newApps[id] = {
              ...newApps[id],
              isOpen: isTargetApp ? true : newApps[id].isOpen, // Ensure target is open
              isForeground: isTargetApp, // Target is foreground
              // Update initialData ONLY for the target app
              initialData: isTargetApp ? initialData : newApps[id].initialData,
            };
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit event (optional, but good for consistency)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: true,
              isForeground: true,
              updatedData: !!initialData, // Indicate if data was updated
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      navigateToNextApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const nextAppId = windowOrder[
          (currentIndex + 1) % windowOrder.length
        ] as AppId;
        get().bringToForeground(nextAppId);
      },

      navigateToPreviousApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const prevIndex =
          (currentIndex - 1 + windowOrder.length) % windowOrder.length;
        const prevAppId = windowOrder[prevIndex] as AppId;
        get().bringToForeground(prevAppId);
      },

      clearInitialData: (appId) => {
        set((state) => {
          if (state.apps[appId]?.initialData) {
            console.log(`[AppStore] Clearing initialData for ${appId}`);
            return {
              apps: {
                ...state.apps,
                [appId]: {
                  ...state.apps[appId],
                  initialData: undefined,
                },
              },
            };
          }
          return state; // No change needed
        });
      },

      clearInstanceInitialData: (instanceId: string) => {
        set((state) => {
          if (state.instances[instanceId]?.initialData) {
            console.log(
              `[AppStore] Clearing initialData for instance ${instanceId}`
            );
            return {
              instances: {
                ...state.instances,
                [instanceId]: {
                  ...state.instances[instanceId],
                  initialData: undefined,
                },
              },
            };
          }
          return state; // No change needed
        });
      },

      // Add instance management
      instances: {},
      instanceWindowOrder: [],
      nextInstanceId: 0,

      // Instance management methods
      createAppInstance: (appId, initialData, title) => {
        const instanceId = (++get().nextInstanceId).toString();

        // Calculate position with offset for multiple windows
        const existingInstances = Object.values(get().instances).filter(
          (instance) => instance.appId === appId && instance.isOpen
        );
        const offsetMultiplier = existingInstances.length;
        const baseOffset = 16;
        const offsetStep = 32;

        const isMobile = window.innerWidth < 768;
        const position = {
          x: isMobile ? 0 : baseOffset + offsetMultiplier * offsetStep,
          y: isMobile ? 28 : 40 + offsetMultiplier * 20,
        };

        // Get default size from window config
        const config = getWindowConfig(appId);
        const size = isMobile
          ? {
              width: window.innerWidth,
              height: config.defaultSize.height,
            }
          : config.defaultSize;

        set((state) => ({
          instances: {
            ...state.instances,
            [instanceId]: {
              instanceId,
              appId,
              isOpen: true,
              isForeground: true,
              initialData,
              title,
              position,
              size,
            },
          },
          instanceWindowOrder: [...state.instanceWindowOrder, instanceId],
        }));

        // Bring all other instances to background
        set((state) => {
          const updatedInstances = { ...state.instances };
          Object.keys(updatedInstances).forEach((id) => {
            if (id !== instanceId) {
              updatedInstances[id] = {
                ...updatedInstances[id],
                isForeground: false,
              };
            }
          });
          return { instances: updatedInstances };
        });

        return instanceId;
      },
      closeAppInstance: (instanceId) => {
        set((state) => {
          if (!state.instances[instanceId]?.isOpen) {
            console.log(
              `Instance ${instanceId} is already closed. No action taken.`
            );
            return state; // Instance is already closed, do nothing
          }

          console.log(`Closing instance: ${instanceId}`);

          const closingInstance = state.instances[instanceId];
          const newInstanceWindowOrder = state.instanceWindowOrder.filter(
            (id) => id !== instanceId
          );
          const newInstances: Record<string, AppInstance> = {
            ...state.instances,
          };

          // Find the next instance to bring to foreground
          let nextForegroundInstanceId: string | null = null;

          // First, try to find another open instance of the same app
          const sameAppInstances = Object.values(state.instances)
            .filter(
              (instance) =>
                instance.appId === closingInstance.appId &&
                instance.instanceId !== instanceId &&
                instance.isOpen
            )
            .map((instance) => instance.instanceId);

          if (sameAppInstances.length > 0) {
            // Find the most recently used instance of the same app
            // (the one that appears last in the window order among same-app instances)
            for (let i = newInstanceWindowOrder.length - 1; i >= 0; i--) {
              const candidateId = newInstanceWindowOrder[i];
              if (sameAppInstances.includes(candidateId)) {
                nextForegroundInstanceId = candidateId;
                break;
              }
            }

            // If no same-app instance found in window order, use the first available
            if (!nextForegroundInstanceId) {
              nextForegroundInstanceId = sameAppInstances[0];
            }
          } else {
            // No other instances of the same app, fall back to the last instance in window order
            nextForegroundInstanceId =
              newInstanceWindowOrder.length > 0
                ? newInstanceWindowOrder[newInstanceWindowOrder.length - 1]
                : null;
          }

          // Actually remove the closed instance from the store
          delete newInstances[instanceId];

          // Update foreground status for remaining instances
          Object.keys(newInstances).forEach((id) => {
            newInstances[id] = {
              ...newInstances[id],
              // Bring the selected next instance to foreground
              isForeground: id === nextForegroundInstanceId,
            };
          });

          const newState = {
            instances: newInstances,
            instanceWindowOrder: newInstanceWindowOrder,
          };

          // Emit DOM event for closing
          const instanceStateChangeEvent = new CustomEvent(
            "instanceStateChange",
            {
              detail: {
                instanceId,
                isOpen: false,
                isForeground: false,
              },
            }
          );
          window.dispatchEvent(instanceStateChangeEvent);
          console.log(
            `Instance ${instanceId} closed and removed. New instance order:`,
            newInstanceWindowOrder
          );
          console.log(
            `Instance ${
              nextForegroundInstanceId || "none"
            } brought to foreground.`
          );

          return newState;
        });
      },
      bringInstanceToForeground: (instanceId) => {
        set((state) => {
          const newState = {
            instances: { ...state.instances },
            instanceWindowOrder: [...state.instanceWindowOrder],
          };

          // If empty string provided, just clear foreground flags
          if (!instanceId) {
            Object.keys(newState.instances).forEach((id) => {
              newState.instances[id] = {
                ...newState.instances[id],
                isForeground: false,
              };
            });
          } else {
            // Re‑order instanceWindowOrder so that instanceId is last (top‑most)
            newState.instanceWindowOrder = [
              ...newState.instanceWindowOrder.filter(
                (id: string) => id !== instanceId
              ),
              instanceId,
            ];

            // Set foreground flags
            Object.keys(newState.instances).forEach((id) => {
              newState.instances[id] = {
                ...newState.instances[id],
                isForeground: id === instanceId,
              };
            });
          }

          // Emit DOM event (keep behaviour parity)
          const instanceStateChangeEvent = new CustomEvent(
            "instanceStateChange",
            {
              detail: {
                instanceId,
                isOpen: newState.instances[instanceId]?.isOpen || false,
                isForeground: true,
              },
            }
          );
          window.dispatchEvent(instanceStateChangeEvent);

          return newState;
        });
      },
      updateInstanceWindowState: (instanceId, position, size) =>
        set((state) => ({
          instances: {
            ...state.instances,
            [instanceId]: {
              ...state.instances[instanceId],
              position,
              size,
            },
          },
        })),
      getInstancesByAppId: (appId) => {
        return Object.values(get().instances).filter(
          (instance) => instance.appId === appId
        );
      },
      getForegroundInstance: () => {
        const { instanceWindowOrder, instances } = get();
        if (instanceWindowOrder.length > 0) {
          const lastInstanceId =
            instanceWindowOrder[instanceWindowOrder.length - 1];
          return instances[lastInstanceId] || null;
        }
        return null;
      },
      navigateToNextInstance: (currentInstanceId) => {
        const { instanceWindowOrder } = get();
        if (instanceWindowOrder.length <= 1) return;
        const currentIndex = instanceWindowOrder.indexOf(currentInstanceId);
        if (currentIndex === -1) return;
        const nextInstanceId =
          instanceWindowOrder[(currentIndex + 1) % instanceWindowOrder.length];
        get().bringInstanceToForeground(nextInstanceId);
      },
      navigateToPreviousInstance: (currentInstanceId) => {
        const { instanceWindowOrder } = get();
        if (instanceWindowOrder.length <= 1) return;
        const currentIndex = instanceWindowOrder.indexOf(currentInstanceId);
        if (currentIndex === -1) return;
        const prevIndex =
          (currentIndex - 1 + instanceWindowOrder.length) %
          instanceWindowOrder.length;
        const prevInstanceId = instanceWindowOrder[prevIndex];
        get().bringInstanceToForeground(prevInstanceId);
      },
      launchApp: (appId, initialData, title, multiWindow = false) => {
        const state = get();

        // Check if multi-window is supported for this app
        const supportsMultiWindow =
          multiWindow || appId === "textedit" || appId === "finder"; // TextEdit and Finder support multi-window

        if (!supportsMultiWindow) {
          // Use existing single-window behavior
          const existingInstance = Object.values(state.instances).find(
            (instance) => instance.appId === appId && instance.isOpen
          );

          if (existingInstance) {
            // Focus existing instance
            state.bringInstanceToForeground(existingInstance.instanceId);
            // Update initialData if provided
            if (initialData) {
              set((s) => ({
                instances: {
                  ...s.instances,
                  [existingInstance.instanceId]: {
                    ...s.instances[existingInstance.instanceId],
                    initialData,
                  },
                },
              }));
            }
            return existingInstance.instanceId;
          }
        }

        // Create new instance
        return state.createAppInstance(appId, initialData, title);
      },
    }),
    {
      name: "ryos:app-store",
      version: CURRENT_APP_STORE_VERSION,
      partialize: (state): Partial<AppStoreState> => ({
        windowOrder: state.windowOrder,
        apps: state.apps,
        version: state.version,
        debugMode: state.debugMode,
        shaderEffectEnabled: state.shaderEffectEnabled,
        selectedShaderType: state.selectedShaderType,
        uiSoundsEnabled: state.uiSoundsEnabled,
        displayMode: state.displayMode,
        isFirstBoot: state.isFirstBoot,
        wallpaperSource: state.wallpaperSource,
        uiVolume: state.uiVolume,
        ipodVolume: state.ipodVolume,
        masterVolume: state.masterVolume,
        // Only persist open instances to avoid storing closed instances
        instances: Object.fromEntries(
          Object.entries(state.instances).filter(
            ([, instance]) => instance.isOpen
          )
        ),
        instanceWindowOrder: state.instanceWindowOrder,
        nextInstanceId: state.nextInstanceId,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const migrated = persistedState as AppStoreState;
        console.log(
          "[AppStore] Migrating from version",
          version,
          "to",
          CURRENT_APP_STORE_VERSION
        );

        const migratedState = migrated;

        // Migration logic for version 2: Remove TTS-related fields
        if (
          (persistedState as any).version < 2 &&
          persistedState &&
          typeof persistedState === "object"
        ) {
          const migratedState = { ...(persistedState as any) };
          delete migratedState.ttsModel;
          delete migratedState.ttsVoice;

          return {
            ...migratedState,
            version: 2,
          };
        }

        // Update version to current
        migratedState.version = CURRENT_APP_STORE_VERSION;

        return migratedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Clean up instanceWindowOrder to remove any non-existent instance IDs
          if (state.instanceWindowOrder && state.instances) {
            state.instanceWindowOrder = state.instanceWindowOrder.filter(
              (instanceId) => state.instances[instanceId]
            );
          }

          // Ensure nextInstanceId is set correctly to avoid ID collisions
          if (state.instances && Object.keys(state.instances).length > 0) {
            const maxId = Math.max(
              ...Object.keys(state.instances).map((id) => parseInt(id, 10))
            );
            if (!isNaN(maxId) && maxId >= state.nextInstanceId) {
              state.nextInstanceId = maxId + 1;
              console.log(
                `[AppStore] Adjusted nextInstanceId to ${state.nextInstanceId} to avoid collisions`
              );
            }
          }

          // Ensure all rehydrated instances have their persisted positions and sizes
          if (state.instances) {
            Object.keys(state.instances).forEach((instanceId) => {
              const instance = state.instances[instanceId];
              // Ensure instances have position and size
              if (!instance.position || !instance.size) {
                console.log(
                  `[AppStore] Instance ${instanceId} missing position/size, applying defaults`
                );
                const config = getWindowConfig(instance.appId);
                const isMobile = window.innerWidth < 768;

                // Apply default position if missing
                if (!instance.position) {
                  instance.position = {
                    x: isMobile ? 0 : 16,
                    y: isMobile ? 28 : 40,
                  };
                }

                // Apply default size if missing
                if (!instance.size) {
                  instance.size = isMobile
                    ? {
                        width: window.innerWidth,
                        height: config.defaultSize.height,
                      }
                    : config.defaultSize;
                }
              }
            });
          }

          // Migrate old app states to instances
          const hasOldOpenApps = Object.values(state.apps || {}).some(
            (app) => app.isOpen
          );
          const hasInstances = Object.keys(state.instances || {}).length > 0;

          if (hasOldOpenApps && !hasInstances) {
            console.log("[AppStore] Migrating old app states to instances");
            let instanceIdCounter = state.nextInstanceId || 0;
            const newInstances: Record<string, AppInstance> = {};
            const newInstanceWindowOrder: string[] = [];

            // Convert each open app to an instance
            state.windowOrder.forEach((appId) => {
              const appState = state.apps[appId];
              if (appState?.isOpen) {
                const instanceId = (++instanceIdCounter).toString();
                newInstances[instanceId] = {
                  instanceId,
                  appId: appId as AppId,
                  isOpen: true,
                  isForeground: appState.isForeground,
                  position: appState.position,
                  size: appState.size,
                  initialData: appState.initialData,
                };
                newInstanceWindowOrder.push(instanceId);
              }
            });

            // Update state with migrated instances
            state.instances = newInstances;
            state.instanceWindowOrder = newInstanceWindowOrder;
            state.nextInstanceId = instanceIdCounter;

            // Clear old app states to prevent confusion
            Object.keys(state.apps).forEach((appId) => {
              state.apps[appId] = {
                isOpen: false,
                isForeground: false,
              };
            });
            state.windowOrder = [];
          }
        }
      },
    }
  )
);

// Wallpaper / background handling --------------------------------------------------
export const INDEXEDDB_PREFIX = "indexeddb://";
const CUSTOM_WALLPAPERS_STORE = "custom_wallpapers";
// Simple in-memory cache for Object URLs to avoid re-creations
const objectURLs: { [key: string]: string } = {};

// Structure stored in IndexedDB for custom wallpapers
type StoredWallpaper = {
  blob?: Blob;
  content?: string;
  [key: string]: unknown;
};

// Helper to convert a data URL to a Blob (for backwards compatibility)
const dataURLToBlob = (dataURL: string): Blob | null => {
  try {
    const arr = dataURL.split(",");
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error("dataURLToBlob failed:", err);
    return null;
  }
};

// Save a custom wallpaper (image file) to IndexedDB and return its reference string
const saveCustomWallpaper = async (file: File): Promise<string> => {
  const db = await ensureIndexedDBInitialized();
  const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readwrite");
  const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ blob: file }, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return `${INDEXEDDB_PREFIX}${id}`;
};

// Global utility: clearAllAppStates – used by Control Panels "Reset All" button.
export const clearAllAppStates = (): void => {
  useAppStore.persist.clearStorage();
  // Optionally, also clear IndexedDB stores if needed
  // This is a destructive action, use with caution
};

// -------------------------------------------------------------------------------
