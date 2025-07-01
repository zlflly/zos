import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./useAppStore";
import { useIpodStore } from "./useIpodStore";

// Generic helper to wrap a selector with Zustand's shallow comparator for AppStore
export function useAppStoreShallow<T>(
  selector: (state: ReturnType<typeof useAppStore.getState>) => T
): T {
  return useAppStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for IpodStore
export function useIpodStoreShallow<T>(
  selector: (state: ReturnType<typeof useIpodStore.getState>) => T
): T {
  return useIpodStore(useShallow(selector));
}