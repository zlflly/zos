import { useState, useRef, useEffect, useCallback } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ControlPanelsMenuBar } from "./ControlPanelsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WallpaperPicker } from "./WallpaperPicker";
import { AppProps, ControlPanelsInitialData } from "@/apps/base/types";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { useFileSystem, dbOperations, DocumentContent } from "@/apps/finder/hooks/useFileSystem";
import { useAppStoreShallow } from "@/stores/helpers";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { VolumeMixer } from "./VolumeMixer";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import React from "react";
import { DisplayMode } from "@/utils/displayMode";
import { ShaderType } from "@/components/shared/GalaxyBackground";
import { v4 as uuidv4 } from "uuid";
import { FileSystemItem } from "@/stores/useFilesStore";

interface StoreItem {
  name: string;
  content?: string | Blob;
  type?: string;
  modifiedAt?: string;
  size?: number;
  [key: string]: unknown;
}

interface StoreItemWithKey {
  key: string;
  value: StoreItem;
}

type PhotoCategory =
  | "3d_graphics"
  | "convergency"
  | "foliage"
  | "landscapes"
  | "nostalgia"
  | "objects"
  | "structures";

const PHOTO_WALLPAPERS: Record<PhotoCategory, string[]> = {
  "3d_graphics": [
    "capsule",
    "capsule_azul",
    "capsule_pistachio",
    "tub",
    "tub_azul",
    "tub_bondi",
    "ufo_1",
    "ufo_2",
    "ufo_3",
  ],
  convergency: Array.from({ length: 15 }, (_, i) => `convergence_${i + 1}`),
  foliage: [
    "blue_flowers",
    "cactus",
    "golden_poppy",
    "red_cyclamens",
    "red_tulips",
    "rose",
    "spider_lily",
    "waterdrops_on_leaf",
    "yellow_tulips",
  ],
  landscapes: [
    "beach",
    "clouds",
    "french_alps",
    "ganges_river",
    "golden_gate_at_dusk",
    "mono_lake",
    "palace_on_lake_in_jaipur",
    "rain_god_mesa",
    "refuge-col_de_la_grasse-alps",
    "zabriskie_point",
  ],
  nostalgia: [
    "acropolis",
    "beach_on_ko_samui",
    "birds_in_flight",
    "cancun_sunset",
    "cliffs_of_moher",
    "fish_eagle",
    "galway_bay",
    "glacier_national_park",
    "highway_395",
    "hong_kong_at_night",
    "islamorada_sunrise",
    "lily_pad",
    "long_island_sound",
    "mac_os_background",
    "midsummer_night",
    "moraine_lake",
    "oasis_in_baja",
    "red_clouds",
    "toronto_skyline",
    "tuolumne_meadows",
    "yosemite_valley",
    "yucatan",
  ],
  objects: [
    "alpine_granite",
    "bicycles",
    "bottles",
    "burmese_claypots",
    "burning_candle",
    "chairs",
    "faucet_handle",
    "neon",
    "salt_shaker_top",
    "shamus",
  ],
  structures: [
    "gate",
    "gate_lock",
    "glass_door_knob",
    "padlock",
    "rusty_lock",
    "shutters",
    "stone_wall",
    "wall_of_stones",
  ],
};

// Transform photo paths
Object.entries(PHOTO_WALLPAPERS).forEach(([category, photos]) => {
  PHOTO_WALLPAPERS[category as PhotoCategory] = photos.map(
    (name) => `/wallpapers/photos/${category}/${name}.jpg`
  );
});

// Utility to convert Blob to base64 string for JSON serialization
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string; // data:<mime>;base64,xxxx
      resolve(dataUrl);
    };
    reader.onerror = (error) => {
      console.error("Error converting blob to base64:", error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });

// Utility to convert base64 data URL back to Blob
const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([array], { type: mime });
};

const DISPLAY_MODES: DisplayMode[] = [
  "color",
  "monotone",
  "crt",
  "sepia",
  "high-contrast",
  "dream",
  "invert",
];

export function ControlPanelsAppComponent({
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<ControlPanelsInitialData>) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToRestoreRef = useRef<File | null>(null);
  const { formatFileSystem } = useFileSystem();
  const {
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    selectedShaderType,
    setSelectedShaderType,
    uiSoundsEnabled,
    setUiSoundsEnabled,
    displayMode,
    setDisplayMode,
    isFirstBoot,
    setHasBooted,
    masterVolume,
    setMasterVolume,
    uiVolume,
    setUiVolume,
    ipodVolume,
    setIpodVolume,
  } = useAppStoreShallow((state) => ({
    debugMode: state.debugMode,
    setDebugMode: state.setDebugMode,
    shaderEffectEnabled: state.shaderEffectEnabled,
    setShaderEffectEnabled: state.setShaderEffectEnabled,
    selectedShaderType: state.selectedShaderType,
    setSelectedShaderType: state.setSelectedShaderType,
    uiSoundsEnabled: state.uiSoundsEnabled,
    setUiSoundsEnabled: state.setUiSoundsEnabled,
    displayMode: state.displayMode,
    setDisplayMode: state.setDisplayMode,
    isFirstBoot: state.isFirstBoot,
    setHasBooted: state.setHasBooted,
    masterVolume: state.masterVolume,
    setMasterVolume: state.setMasterVolume,
    uiVolume: state.uiVolume,
    setUiVolume: state.setUiVolume,
    ipodVolume: state.ipodVolume,
    setIpodVolume: state.setIpodVolume,
  }));
  const {
    logout,
    hasPassword,
    username,
    authToken,
    promptSetUsername,
    promptVerifyToken,
  } = useAuth();

  // State for the currently active tab
  const [activeTab, setActiveTab] = useState(
    initialData?.defaultTab || "display"
  );

  useEffect(() => {
    // Changed from isWindowOpen to always true as WindowFrame manages this internally
    setIsConfirmResetOpen(false);
    setIsConfirmFormatOpen(false);
  }, []); // Empty dependency array means this runs once on mount

  // Handle actions from the MenuBar
  // Renamed to handleMenuAction to avoid conflict with WindowFrame's onAction prop
  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case "about":
        setIsAboutDialogOpen(true);
        break;
      case "help":
        setIsHelpDialogOpen(true);
        break;
      case "resetAll":
        setIsConfirmResetOpen(true);
        break;
      case "formatDisk":
        setIsConfirmFormatOpen(true);
        break;
    }
  }, []);

  const handleUISoundsChange = (enabled: boolean) => {
    setUiSoundsEnabled(enabled);
  };

  const handleMasterMuteToggle = () => {
    if (masterVolume > 0) {
      setMasterVolume(0);
    } else {
      setMasterVolume(1);
    }
  };

  const handleUiMuteToggle = () => {
    if (uiVolume > 0) {
      setUiVolume(0);
    } else {
      setUiVolume(1);
    }
  };

  const handleIpodMuteToggle = () => {
    if (ipodVolume > 0) {
      setIpodVolume(0);
    } else {
      setIpodVolume(1);
    }
  };

  const handleResetAll = () => {
    setIsConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    performReset();
    setIsConfirmResetOpen(false);
  };

  const performReset = () => {
    // Clear all App states via persisted storage mechanism
    clearAllAppStates();
    // Reset IndexedDB for file system (excluding wallpapers)
    ensureIndexedDBInitialized(); // Re-initialize to clear
    // Clear next boot message
    clearNextBootMessage();

    // Force refresh to reload all states
    window.location.reload();
  };

  const handleBackup = async () => {
      const db = await ensureIndexedDBInitialized();
    const tx = db.transaction(db.objectStoreNames, "readonly");
    const stores: { [key: string]: StoreItemWithKey[] } = {};

      const getStoreData = async (
        storeName: string
      ): Promise<StoreItemWithKey[]> => {
      const store = tx.objectStore(storeName);
      const request = store.getAll();
        return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result.map((item) => ({ key: item.name, value: item }))
          );
        };
        request.onerror = () => {
          reject(request.error);
        };
      });
    };

    // Fetch data from all object stores dynamically
    for (let i = 0; i < db.objectStoreNames.length; i++) {
      const storeName = db.objectStoreNames.item(i)!;
      if (storeName === "custom_wallpapers") {
        // Skip custom wallpapers for now as they are Blobs
        continue;
      }
      stores[storeName] = await getStoreData(storeName);
    }

    // Serialize Blobs in custom_wallpapers store
    const customWallpapers = await dbOperations.getAll<DocumentContent>(
      "custom_wallpapers"
    );
    stores.custom_wallpapers = await Promise.all(
      customWallpapers.map(async (wp) => ({
        key: wp.name,
        value: {
          name: wp.name,
          content: typeof wp.content === "string" ? wp.content : await blobToBase64(wp.content as Blob),
          type: "image/jpeg", // Assuming jpeg for wallpapers, adjust if needed
        },
      }))
    );

      const serializeStore = async (items: StoreItemWithKey[]) =>
        Promise.all(
          items.map(async (item) => {
          if (item.value.content instanceof Blob) {
            return {
              ...item,
              value: {
                ...item.value,
                content: await blobToBase64(item.value.content),
              },
            };
          }
          return item;
        })
      );

    const allDataSerialized: { [key: string]: StoreItemWithKey[] } = {};
    for (const storeName in stores) {
      allDataSerialized[storeName] = await serializeStore(stores[storeName]);
    }

    const backupData = JSON.stringify(allDataSerialized, null, 2);
    const blob = new Blob([backupData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
    a.download = `ryos_backup_${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    toast.success("Backup created successfully!");
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    fileToRestoreRef.current = event.target.files?.[0] || null;
    if (fileToRestoreRef.current) {
    performRestore();
    }
  };

  const performRestore = async () => {
    if (!fileToRestoreRef.current) {
      toast.error("No backup file selected.");
      return;
    }

    try {
      const fileContent = await fileToRestoreRef.current.text();
      const backupData = JSON.parse(fileContent);

            const db = await ensureIndexedDBInitialized();

            const restoreStoreData = async (
              storeName: string,
              dataToRestore: Array<StoreItem | StoreItemWithKey>
            ): Promise<void> => {
        const store = (await ensureIndexedDBInitialized()).transaction(
          storeName,
          "readwrite"
        ).objectStore(storeName);

        // Clear existing data in the store
        await new Promise<void>((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        // Add new data
        for (const item of dataToRestore) {
          const value: StoreItem = "value" in item && typeof item.value === 'object' && item.value !== null ? item.value as StoreItem : item as StoreItem;
          if (value.type?.startsWith("image/") && typeof value.content === "string") {
            (value as any).content = base64ToBlob(value.content);
          }
          const now = Date.now();
          const finalItem: Partial<FileSystemItem> = {
            ...value,
            status: "active",
            size: value.size || (value.content instanceof Blob ? value.content.size : 0),
            modifiedAt: value.modifiedAt ? new Date(value.modifiedAt).getTime() : now,
            createdAt: now,
          };
          
          await new Promise<void>((resolve, reject) => {
            const request = store.put(finalItem);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      };

      // Restore each store based on the backup data
      for (const storeName in backupData) {
        await restoreStoreData(storeName, backupData[storeName]);
      }

      // Special handling for legacy file system data
      const legacyFiles = backupData.files || [];
      if (legacyFiles.length > 0) {
        console.log("[ControlPanels] Migrating legacy files during restore...");
        const fileSystemStore = db.transaction("files", "readwrite").objectStore("files");
        await Promise.all(
          legacyFiles.map((file: { path: string; name: string; type: string; icon: string; }) => {
            const fullPath = file.path.endsWith("/") ? `${file.path}${file.name}` : `${file.path}/${file.name}`;
            const newFile: FileSystemItem = {
              uuid: uuidv4(), // Generate new UUID for legacy files
              path: fullPath,
              name: file.name,
              type: file.type,
              icon: file.icon,
              isDirectory: file.type === "folder",
              createdAt: Date.now(),
              modifiedAt: Date.now(),
                      status: "active",
            };
            return dbOperations.put("files", newFile, newFile.path);
          })
        );
      }
      // Ensure root folders exist
      const rootFolders = [
        { uuid: uuidv4(), path: "/Applications", name: "Applications", isDirectory: true, type: "folder", icon: "/icons/applications.png" , status: "active" },
        { uuid: uuidv4(), path: "/Documents", name: "Documents", isDirectory: true, type: "folder", icon: "/icons/documents.png" , status: "active" },
        { uuid: uuidv4(), path: "/Desktop", name: "Desktop", isDirectory: true, type: "folder", icon: "/icons/directory.png" , status: "active" },
        { uuid: uuidv4(), path: "/Downloads", name: "Downloads", isDirectory: true, type: "folder", icon: "/icons/directory.png" , status: "active" },
        { uuid: uuidv4(), path: "/Music", name: "Music", isDirectory: true, type: "folder", icon: "/icons/music.png" , status: "active" },
        { uuid: uuidv4(), path: "/Pictures", name: "Pictures", isDirectory: true, type: "folder", icon: "/icons/images.png" , status: "active" },
        { uuid: uuidv4(), path: "/Trash", name: "Trash", isDirectory: true, type: "folder", icon: "/icons/trash-empty.png" , status: "active" },
        // Add Games folder since we now have games
        { uuid: uuidv4(), path: "/Games", name: "Games", isDirectory: true, type: "folder", icon: "/icons/joystick.png" , status: "active" },
      ];

      for (const folder of rootFolders) {
        const existing = await dbOperations.get<FileSystemItem>("files", folder.path);
        if (!existing) {
          await dbOperations.put("files", folder, folder.path);
        }
      }

      toast.success("Backup restored successfully!", {
        description: "Please refresh the page to see the changes.",
      });
      // Force refresh to reload all states
      window.location.reload();
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast.error("Failed to restore backup.", {
        description: (error as Error).message || "An unknown error occurred.",
      });
    } finally {
      fileToRestoreRef.current = null;
    }
  };

  const handleConfirmFormat = () => {
    performFormat();
    setIsConfirmFormatOpen(false);
  };

  const performFormat = async () => {
    await formatFileSystem();
    toast.success("Disk formatted successfully!", {
      description: "All files have been cleared. Please refresh the page.",
    });
    window.location.reload();
  };

  return (
      <WindowFrame
      appId="control-panels"
        title="Control Panels"
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
      <div className="flex flex-col h-full bg-white text-black p-4">
        <ControlPanelsMenuBar
          onClose={onClose}
          onShowHelp={() => setIsHelpDialogOpen(true)}
          onShowAbout={() => setIsAboutDialogOpen(true)}
        />
          <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full flex-grow flex flex-col"
          >
          <TabsList className="grid w-full grid-cols-3 bg-gray-200 p-1 rounded-md mb-4">
              <TabsTrigger
              value="display"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 rounded-sm"
              >
              Display
              </TabsTrigger>
              <TabsTrigger
                value="sound"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 rounded-sm"
              >
                Sound
              </TabsTrigger>
              <TabsTrigger
              value="security"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 rounded-sm"
              >
              Security
              </TabsTrigger>
            {/* <TabsTrigger
              value="accessibility"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 rounded-sm"
            >
              Accessibility
            </TabsTrigger> */}
          </TabsList>
          <TabsContent value="display" className="flex-grow flex flex-col mt-0">
            <div className="flex flex-col space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Wallpaper</h3>
                <WallpaperPicker />
              </div>

              <div className="flex items-center space-x-2">
                    <Switch
                  id="shader-effect"
                  checked={shaderEffectEnabled}
                  onCheckedChange={setShaderEffectEnabled}
                />
                <Label htmlFor="shader-effect" className="text-sm">
                  Enable Shader Effect
                </Label>
                  </div>
              <div>
                <Label htmlFor="shader-type" className="text-sm font-semibold mb-2">
                  Shader Type
                </Label>
                <Select
                  value={selectedShaderType}
                  onValueChange={(value: ShaderType) =>
                    setSelectedShaderType(value)
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select a shader type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ShaderType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Display Mode</h3>
                    <Select
                  value={displayMode}
                  onValueChange={(value: DisplayMode) =>
                    setDisplayMode(value)
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select display mode" />
                      </SelectTrigger>
                      <SelectContent>
                    {DISPLAY_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
          </TabsContent>

          <TabsContent value="sound" className="flex-grow flex flex-col mt-0">
            <div className="flex flex-col space-y-4">
                <VolumeMixer
                  masterVolume={masterVolume}
                  setMasterVolume={setMasterVolume}
                  handleMasterMuteToggle={handleMasterMuteToggle}
                  uiVolume={uiVolume}
                  setUiVolume={setUiVolume}
                  handleUiMuteToggle={handleUiMuteToggle}
                  ipodVolume={ipodVolume}
                  setIpodVolume={setIpodVolume}
                  handleIpodMuteToggle={handleIpodMuteToggle}
                isIOS={false} // Assuming not iOS for desktop app
              />
              <div className="flex items-center space-x-2">
                <Switch
                  id="ui-sounds"
                  checked={uiSoundsEnabled}
                  onCheckedChange={handleUISoundsChange}
                />
                <Label htmlFor="ui-sounds" className="text-sm">
                  Enable UI Sounds
                    </Label>
                  </div>
            </div>
          </TabsContent>

          <TabsContent
            value="security"
            className="flex-grow flex flex-col mt-0"
          >
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="username-input" className="text-sm w-[100px]">
                  Username:
                      </Label>
                <span className="text-sm font-semibold flex-grow">
                  {username || "(Not set)"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={promptSetUsername}
                  className="ml-auto"
                >
                  {username ? "Change" : "Set"}
                </Button>
                    </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="token-status" className="text-sm w-[100px]">
                  Auth Token:
                </Label>
                <span className="text-sm font-semibold flex-grow">
                  {authToken ? "Set" : "Not Set"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={promptVerifyToken}
                  className="ml-auto"
                >
                  {authToken ? "Verify" : "Set"}
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="password-status" className="text-sm w-[100px]">
                  Password:
                </Label>
                <span className="text-sm font-semibold flex-grow">
                  {hasPassword ? "Set" : "Not Set"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.error("Authentication feature removed.")}
                  className="ml-auto"
                >
                  {hasPassword ? "Change" : "Set"}
                </Button>
                  </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={logout}
                className="w-fit"
                disabled={!username && !authToken}
              >
                Logout
              </Button>

              <hr className="my-4" />

              <h3 className="text-sm font-semibold mb-2">Advanced Options</h3>

              <div className="flex items-center space-x-2">
                <Label htmlFor="first-boot" className="text-sm">
                  Show First Boot Experience
                      </Label>
                <Switch
                  id="first-boot"
                  checked={isFirstBoot}
                  onCheckedChange={() => setHasBooted()}
                  className="ml-auto"
                />
                    </div>

                    <Button
                variant="destructive"
                size="sm"
                onClick={handleResetAll}
                      className="w-fit"
                    >
                Reset All Settings
                    </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmFormat}
                className="w-fit"
              >
                Format Disk
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleBackup}
                className="w-fit"
              >
                Backup All Data
              </Button>
              <div className="flex items-center space-x-2 w-fit">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Restore Data from Backup
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleRestore}
                  style={{ display: "none" }}
                  accept=".json"
                />
                  </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

      <HelpDialog isOpen={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} helpItems={helpItems} appName={appMetadata.name} />
      <AboutDialog isOpen={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen} metadata={appMetadata} />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
        title="Reset All Settings?"
        description="This will reset all application settings and log you out. This action cannot be undone."
          onConfirm={handleConfirmReset}
        />
        <ConfirmDialog
          isOpen={isConfirmFormatOpen}
          onOpenChange={setIsConfirmFormatOpen}
        title="Format Disk?"
        description="This will delete ALL files in your virtual file system (Documents, Desktop, etc.). This action cannot be undone."
          onConfirm={handleConfirmFormat}
      />
      {/* <LoginDialog /> */}
      {/* <InputDialog ... /> */}
      {/* <LogoutDialog ... /> */}
      <p className="font-geneva-12 text-[10px]">
        Note: This app is a frontend for managing settings stored in your
        browser. No data is stored on our servers. Your settings are private
        and local to your device.
      </p>
      <p className="mt-4 font-bold font-geneva-12 text-[10px]">
        User is {hasPassword ? "logged in" : "not logged in"}
      </p>
      {!hasPassword && (
        <Button
          variant="retro"
          className="w-full mt-2"
          onClick={() => toast.error("Authentication feature removed.")}
        >
          Set Session Password
        </Button>
      )}
      </WindowFrame>
  );
}
