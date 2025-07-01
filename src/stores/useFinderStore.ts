import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAppStore } from "@/stores/useAppStore";

// Re-use types from Finder for consistency
import type {
  ViewType,
  SortType,
} from "@/apps/finder/components/FinderMenuBar";

export interface FinderInstance {
  instanceId: string;
  currentPath: string;
  navigationHistory: string[];
  navigationIndex: number;
  viewType: ViewType;
  sortType: SortType;
  selectedFile: string | null; // Path of selected file
}

interface FinderStoreState {
  // Instance management
  instances: Record<string, FinderInstance>;

  // Legacy single-window support (deprecated, kept for migration)
  viewType: ViewType;
  sortType: SortType;

  // Instance actions
  createInstance: (instanceId: string, initialPath?: string) => void;
  removeInstance: (instanceId: string) => void;
  updateInstance: (
    instanceId: string,
    updates: Partial<Omit<FinderInstance, "instanceId">>
  ) => void;
  getInstance: (instanceId: string) => FinderInstance | null;
  getForegroundInstance: () => FinderInstance | null;

  // Legacy actions (now operate on foreground instance)
  setViewType: (type: ViewType) => void;
  setSortType: (type: SortType) => void;
  reset: () => void;
}

const STORE_VERSION = 2;
const STORE_NAME = "ryos:finder";

export const useFinderStore = create<FinderStoreState>()(
  persist(
    (set, get) => ({
      // Instance state
      instances: {},

      // Legacy state (deprecated)
      viewType: "list",
      sortType: "name",

      // Instance management
      createInstance: (instanceId, initialPath = "/") =>
        set((state) => {
          // Don't create if instance already exists
          if (state.instances[instanceId]) {
            return state;
          }

          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                instanceId,
                currentPath: initialPath,
                navigationHistory: [initialPath],
                navigationIndex: 0,
                viewType: "list",
                sortType: "name",
                selectedFile: null,
              },
            },
          };
        }),

      removeInstance: (instanceId) =>
        set((state) => {
          const newInstances = { ...state.instances };
          delete newInstances[instanceId];
          return { instances: newInstances };
        }),

      updateInstance: (instanceId, updates) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                ...updates,
              },
            },
          };
        }),

      getInstance: (instanceId) => {
        return get().instances[instanceId] || null;
      },

      getForegroundInstance: () => {
        // Get the foreground app instance from app store
        const appStore = useAppStore.getState();
        const foregroundInstance = appStore.getForegroundInstance();

        if (!foregroundInstance || foregroundInstance.appId !== "finder") {
          return null;
        }

        return get().instances[foregroundInstance.instanceId] || null;
      },

      // Legacy actions - kept for backward compatibility
      setViewType: (type) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, viewType: type }));
      },

      setSortType: (type) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, sortType: type }));
      },

      reset: () => {
        // This method should only be used in legacy mode, not with instances
        set((state) => ({
          ...state,
          viewType: "list",
          sortType: "name",
        }));
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        instances: state.instances,
        // Don't persist legacy fields anymore
      }),
      migrate: (persistedState: unknown, version: number) => {
        // Migrate from v1 to v2 (single window to multi-instance)
        if (version < 2) {
          const oldState = persistedState as {
            viewType?: ViewType;
            sortType?: SortType;
          };

          // Create new state with instances
          const migratedState: Partial<FinderStoreState> = {
            instances: {},
            // Keep legacy fields for backward compatibility
            viewType: oldState.viewType || "list",
            sortType: oldState.sortType || "name",
          };

          return migratedState;
        }

        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ensure all instances have required fields
          if (state.instances) {
            Object.keys(state.instances).forEach((instanceId) => {
              const instance = state.instances[instanceId];
              if (instance) {
                // Ensure instance has all required fields with defaults
                state.instances[instanceId] = {
                  instanceId,
                  currentPath: instance.currentPath || "/",
                  navigationHistory: instance.navigationHistory || ["/"],
                  navigationIndex: instance.navigationIndex || 0,
                  viewType: instance.viewType || "list",
                  sortType: instance.sortType || "name",
                  selectedFile: instance.selectedFile || null,
                };
              }
            });
          }
        }
      },
    }
  )
);

// ---------------------------------------------
// Utility: calculateStorageSpace (moved from utils/storage)
// Estimate LocalStorage usage (rough) and quota.
// Returns { total, used, available, percentUsed }
export const calculateStorageSpace = () => {
  let total = 0;
  let used = 0;

  try {
    // Typical LocalStorage quota is ~10 MB – keep same heuristic
    total = 10 * 1024 * 1024;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value) {
        // Each UTF-16 char = 2 bytes
        used += value.length * 2;
      }
    }
  } catch (err) {
    console.error("[FinderStore] Error calculating storage space", err);
  }

  return {
    total,
    used,
    available: total - used,
    percentUsed: Math.round((used / total) * 100),
  };
};
