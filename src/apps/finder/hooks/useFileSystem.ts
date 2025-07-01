import { useState, useEffect, useCallback } from "react";
import { FileItem as DisplayFileItem } from "../components/FileList";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { getNonFinderApps, AppId } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import {
  useInternetExplorerStore,
  type Favorite,
} from "@/stores/useInternetExplorerStore";
import { useFilesStore, FileSystemItem } from "@/stores/useFilesStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useAppStore } from "@/stores/useAppStore";
import { migrateIndexedDBToUUIDs } from "@/utils/indexedDBMigration";
import { useFinderStore } from "@/stores/useFinderStore";

// Store names for IndexedDB (Content)
const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
} as const;

// Export STORE names
export { STORES };

// Interface for content stored in IndexedDB
export interface DocumentContent {
  name: string; // Used as the key in IndexedDB
  content: string | Blob;
  contentUrl?: string; // URL for Blob content (managed temporarily)
}

// Type for items displayed in the UI (might include contentUrl)
interface ExtendedDisplayFileItem extends Omit<DisplayFileItem, "content"> {
  content?: string | Blob; // Keep content for passing to apps
  contentUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any; // Add optional data field for virtual files
  originalPath?: string; // For trash items
  deletedAt?: number; // For trash items
  status?: "active" | "trashed"; // Include status for potential UI differences
}

// Generic CRUD operations
export const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error getting all items from ${storeName}:`, error);
        resolve([]);
      }
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    console.log(
      `[dbOperations] Getting key "${key}" from store "${storeName}"`
    );
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          console.log(
            `[dbOperations] Get success for key "${key}". Result:`,
            request.result
          );
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          console.error(
            `[dbOperations] Get error for key "${key}":`,
            request.error
          );
          db.close();
          reject(request.error);
        };
      } catch (error) {
        console.error(`[dbOperations] Get exception for key "${key}":`, error);
        db.close();
        resolve(undefined);
      }
    });
  },

  async put<T>(storeName: string, item: T, key?: IDBValidKey): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(item, key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error putting item in ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error deleting item from ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error clearing ${storeName}:`, error);
        reject(error);
      }
    });
  },
};

// --- Helper Functions --- //

// Get specific type from extension
function getFileTypeFromExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "unknown";
  switch (ext) {
    case "md":
      return "markdown";
    case "txt":
      return "text";
    case "png":
      return ext;
    case "jpg":
    case "jpeg":
      return "jpg"; // Standardize to jpg for jpeg/jpg files
    case "gif":
      return ext;
    case "webp":
      return ext;
    case "bmp":
      return ext;
    default:
      return "unknown";
  }
}

// Get icon based on FileSystemItem metadata
function getFileIcon(item: FileSystemItem): string {
  if (item.icon) return item.icon; // Use specific icon if provided
  if (item.isDirectory) {
    // Special handling for Trash icon based on content
    if (item.path === "/Trash") {
      // We need a way to know if trash is empty. We'll use local state for now.
      // This will be updated when trashItems state changes.
      return "/icons/trash-empty.png"; // Placeholder, will be updated by effect
    }
    return "/icons/directory.png";
  }

  switch (item.type) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
      return "/icons/image.png";
    case "markdown":
    case "text":
      return "/icons/file-text.png";
    case "application": // Should ideally use item.icon from registry
      return item.icon || "/icons/file.png"; // Use item.icon if available
    case "Music":
      return "/icons/sound.png";
    case "Video":
      return "/icons/video-tape.png";
    case "site-link":
      return "/icons/site.png";
    default:
      return "/icons/file.png";
  }
}

// --- Global flags for cross-instance coordination --- //
// Use localStorage to persist initialization state across page refreshes
const UUID_MIGRATION_KEY = "ryos:indexeddb-uuid-migration-v1";

// Check localStorage for completion status
const isUUIDMigrationDone = () =>
  localStorage.getItem(UUID_MIGRATION_KEY) === "completed";

const loggedInitializationPaths = new Set<string>();

// --- useFileSystem Hook --- //
export interface UseFileSystemOptions {
  /**
   * If true, the hook will skip the expensive loadFiles effect on mount.
   * Useful for components that only need helpers like `saveFile` without
   * reading the file system (e.g. Chats transcript saving).
   */
  skipLoad?: boolean;
  /**
   * Instance ID for multi-window support
   */
  instanceId?: string;
}

export function useFileSystem(
  initialPath: string = "/",
  options: UseFileSystemOptions = {}
) {
  const { instanceId } = options;

  // --------------------------------------------
  // Development-time logging (deduplicated)
  // --------------------------------------------
  if (
    import.meta.env?.MODE === "development" &&
    !loggedInitializationPaths.has(initialPath)
  ) {
    console.log(`[useFileSystem] Hook initialized for path: ${initialPath}`);
    loggedInitializationPaths.add(initialPath);
  }

  // Get Finder store methods
  const finderStore = useFinderStore();
  const updateFinderInstance = finderStore.updateInstance;
  const finderInstance = instanceId
    ? finderStore.getInstance(instanceId)
    : null;

  // Use instance-based state if available, otherwise use local state
  // When using instances, initialize local state from instance data if available
  const [localCurrentPath, setLocalCurrentPath] = useState(
    finderInstance?.currentPath || initialPath
  );
  const [localHistory, setLocalHistory] = useState<string[]>(
    finderInstance?.navigationHistory || [initialPath]
  );
  const [localHistoryIndex, setLocalHistoryIndex] = useState(
    finderInstance?.navigationIndex || 0
  );
  const [, setLocalSelectedFile] = useState<string | null>(
    finderInstance?.selectedFile || null
  );

  // Determine which state to use
  const currentPath = finderInstance?.currentPath || localCurrentPath;
  const history = finderInstance?.navigationHistory || localHistory;
  const historyIndex = finderInstance?.navigationIndex || localHistoryIndex;

  // State setters that work with both instance and local mode
  const setCurrentPath = useCallback(
    (path: string) => {
      if (instanceId && finderInstance) {
        updateFinderInstance(instanceId, { currentPath: path });
      } else {
        setLocalCurrentPath(path);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  const setHistory = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      if (instanceId && finderInstance) {
        const newHistory =
          typeof updater === "function"
            ? updater(finderInstance.navigationHistory)
            : updater;
        updateFinderInstance(instanceId, { navigationHistory: newHistory });
      } else {
        setLocalHistory(updater);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  const setHistoryIndex = useCallback(
    (updater: number | ((prev: number) => number)) => {
      if (instanceId && finderInstance) {
        const newIndex =
          typeof updater === "function"
            ? updater(finderInstance.navigationIndex)
            : updater;
        updateFinderInstance(instanceId, { navigationIndex: newIndex });
      } else {
        setLocalHistoryIndex(updater);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  const setSelectedFilePath = useCallback(
    (path: string | null) => {
      if (instanceId && finderInstance) {
        updateFinderInstance(instanceId, { selectedFile: path });
      } else {
        setLocalSelectedFile(path);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  // Local UI state (not persisted to store)
  const [files, setFiles] = useState<ExtendedDisplayFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtendedDisplayFileItem>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Zustand Stores
  const fileStore = useFilesStore();
  const launchApp = useLaunchApp();
  const {
    tracks: ipodTracks,
    setCurrentIndex: setIpodIndex,
    setIsPlaying: setIpodPlaying,
  } = useIpodStore();
  const {
    videos: videoTracks,
    setCurrentIndex: setVideoIndex,
    setIsPlaying: setVideoPlaying,
  } = useVideoStore();
  const internetExplorerStore = useInternetExplorerStore();

  // Define getParentPath inside hook
  const getParentPath = (path: string): string => {
    if (path === "/") return "/";
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return "/" + parts.slice(0, -1).join("/");
  };

  // --- Lazy Default Content Loader --- //
  const ensureDefaultContent = useCallback(
    async (filePath: string, uuid: string): Promise<boolean> => {
      try {
        // Load the filesystem data from JSON
        const res = await fetch("/data/filesystem.json");
        const data = await res.json();

        // Find the file in the JSON data
        const fileData = data.files?.find(
          (f: { path: string }) => f.path === filePath
        );
        if (!fileData) {
          return false; // No default content for this file
        }

        if (fileData.content) {
          // This is a document with text content
          const storeName = STORES.DOCUMENTS;
          const existingDoc = await dbOperations.get<DocumentContent>(
            storeName,
            uuid
          );
          if (!existingDoc) {
            console.log(
              `[useFileSystem] Loading default content for document ${fileData.name}`
            );
            await dbOperations.put<DocumentContent>(
              storeName,
              {
                name: fileData.name,
                content: fileData.content,
              },
              uuid
            );
            return true;
          }
        } else if (fileData.assetPath) {
          // This is an image with an asset path
          const storeName = STORES.IMAGES;
          const existingImg = await dbOperations.get<DocumentContent>(
            storeName,
            uuid
          );
          if (!existingImg) {
            console.log(
              `[useFileSystem] Loading default content for image ${fileData.name}`
            );
            const response = await fetch(fileData.assetPath);
            if (response.ok) {
              const blob = await response.blob();
              await dbOperations.put<DocumentContent>(
                storeName,
                {
                  name: fileData.name,
                  content: blob,
                },
                uuid
              );
              return true;
            }
          }
        }
        return false;
      } catch (err) {
        console.error(
          `[useFileSystem] Error loading default content for ${filePath}:`,
          err
        );
        return false;
      }
    },
    []
  );

  // --- REORDERED useCallback DEFINITIONS --- //

  // Define navigateToPath first
  const navigateToPath = useCallback(
    (path: string) => {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      setSelectedFile(undefined);
      setSelectedFilePath(null);
      if (normalizedPath !== currentPath) {
        setHistory((prev) => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(normalizedPath);
          return newHistory;
        });
        setHistoryIndex((prev) => prev + 1);
        setCurrentPath(normalizedPath);
      }
    },
    [
      currentPath,
      historyIndex,
      setSelectedFilePath,
      setHistory,
      setHistoryIndex,
      setCurrentPath,
    ]
  );

  // Define loadFiles next
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      let displayFiles: ExtendedDisplayFileItem[] = [];

      // 1. Handle Virtual Directories
      if (currentPath === "/Applications") {
        displayFiles = getNonFinderApps().map((app) => ({
          name: app.name,
          isDirectory: false,
          path: `/Applications/${app.name}`,
          icon: app.icon,
          appId: app.id,
          type: "application",
        }));
      } else if (currentPath === "/Music") {
        // At root music directory, show artist folders
        const artistSet = new Set<string>();

        // Collect all unique artists
        ipodTracks.forEach((track) => {
          if (track.artist) {
            artistSet.add(track.artist);
          }
        });

        // Create a folder for artists with tracks
        displayFiles = Array.from(artistSet).map((artist) => ({
          name: artist,
          isDirectory: true,
          path: `/Music/${encodeURIComponent(artist)}`,
          icon: "/icons/directory.png",
          type: "directory-virtual",
        }));

        // Add an "Unknown Artist" folder if there are tracks without artists
        if (ipodTracks.some((track) => !track.artist)) {
          displayFiles.push({
            name: "Unknown Artist",
            isDirectory: true,
            path: `/Music/Unknown Artist`,
            icon: "/icons/directory.png",
            type: "directory-virtual",
          });
        }
      } else if (currentPath.startsWith("/Music/")) {
        // Inside an artist folder
        const artistName = decodeURIComponent(
          currentPath.replace("/Music/", "")
        );
        const artistTracks = ipodTracks.filter((track) =>
          artistName === "Unknown Artist"
            ? !track.artist
            : track.artist === artistName
        );

        // Display all tracks for this artist
        displayFiles = artistTracks.map((track) => {
          const globalIndex = ipodTracks.findIndex((t) => t.id === track.id);
          return {
            name: `${track.title}.mp3`,
            isDirectory: false,
            path: `/Music/${track.id}`,
            icon: "/icons/sound.png",
            appId: "ipod",
            type: "Music",
            data: { index: globalIndex },
          };
        });
      } else if (currentPath === "/Videos") {
        // At root videos directory, show artist folders
        const artistSet = new Set<string>();

        // Collect all unique artists
        videoTracks.forEach((video) => {
          if (video.artist) {
            artistSet.add(video.artist);
          }
        });

        // Create a folder for artists with videos
        displayFiles = Array.from(artistSet).map((artist) => ({
          name: artist,
          isDirectory: true,
          path: `/Videos/${encodeURIComponent(artist)}`,
          icon: "/icons/directory.png",
          type: "directory-virtual",
        }));

        // Add an "Unknown Artist" folder if there are videos without artists
        if (videoTracks.some((video) => !video.artist)) {
          displayFiles.push({
            name: "Unknown Artist",
            isDirectory: true,
            path: `/Videos/Unknown Artist`,
            icon: "/icons/directory.png",
            type: "directory-virtual",
          });
        }
      } else if (currentPath.startsWith("/Videos/")) {
        // Inside a video artist folder
        const artistName = decodeURIComponent(
          currentPath.replace("/Videos/", "")
        );
        const artistVideos = videoTracks.filter((video) =>
          artistName === "Unknown Artist"
            ? !video.artist
            : video.artist === artistName
        );

        // Display all videos for this artist
        displayFiles = artistVideos.map((video) => {
          const globalIndex = videoTracks.findIndex((v) => v.id === video.id);
          return {
            name: `${video.title}.mov`,
            isDirectory: false,
            path: `/Videos/${video.id}`,
            icon: "/icons/video-tape.png",
            appId: "videos",
            type: "Video",
            data: { index: globalIndex },
          };
        });
      } else if (currentPath.startsWith("/Sites")) {
        console.log(
          `[useFileSystem:loadFiles] Loading /Sites path: ${currentPath}`
        ); // Log entry
        const pathParts = currentPath.split("/").filter(Boolean);
        console.log(`[useFileSystem:loadFiles] Path parts:`, pathParts); // Log parts
        let currentLevelFavorites = internetExplorerStore.favorites;
        let currentVirtualPath = "/Sites";

        // Traverse down the favorites structure based on the path
        for (let i = 1; i < pathParts.length; i++) {
          const folderName = decodeURIComponent(pathParts[i]);
          console.log(
            `[useFileSystem:loadFiles] Traversing into folder: ${folderName}`
          ); // Log traversal
          const parentFolder = currentLevelFavorites.find(
            (fav) => fav.isDirectory && fav.title === folderName
          );
          if (parentFolder && parentFolder.children) {
            currentLevelFavorites = parentFolder.children;
            currentVirtualPath += `/${folderName}`;
            console.log(
              `[useFileSystem:loadFiles] Found sub-folder, new level count: ${currentLevelFavorites.length}`
            ); // Log sub-level
          } else {
            console.log(
              `[useFileSystem:loadFiles] Sub-folder "${folderName}" not found or has no children.`
            ); // Log not found
            currentLevelFavorites = [];
            break;
          }
        }
        console.log(
          `[useFileSystem:loadFiles] Final level favorites to map (count: ${currentLevelFavorites.length}):`,
          currentLevelFavorites
        ); // Log before map

        // Map the current level favorites to FileItems
        displayFiles = currentLevelFavorites.map((fav: Favorite) => {
          const isDirectory = fav.isDirectory ?? false;
          const name = fav.title || (isDirectory ? "Folder" : "Link");
          const path = `${currentVirtualPath}/${encodeURIComponent(name)}`;
          return {
            name: name,
            isDirectory: isDirectory,
            path: path,
            icon: isDirectory
              ? "/icons/directory.png"
              : fav.favicon || "/icons/site.png",
            appId: isDirectory ? undefined : "internet-explorer",
            type: isDirectory ? "directory-virtual" : "site-link",
            data: isDirectory
              ? undefined
              : { url: fav.url, year: fav.year || "current" },
          };
        });
        console.log(
          `[useFileSystem:loadFiles] Mapped displayFiles for /Sites (count: ${displayFiles.length}):`,
          displayFiles
        ); // Log final result
      }
      // 2. Handle Trash Directory (Uses fileStore)
      else if (currentPath === "/Trash") {
        // Get metadata from the store
        const itemsMetadata = fileStore.getItemsInPath(currentPath);
        displayFiles = itemsMetadata.map((item) => ({
          ...item,
          icon: getFileIcon(item), // Get icon based on metadata
          modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
        }));
      }
      // 3. Handle Real Directories (Uses useFilesStore)
      else {
        const itemsMetadata = fileStore.getItemsInPath(currentPath);
        // Map metadata to display items. Content fetching happens on open.
        displayFiles = itemsMetadata.map((item) => ({
          ...item,
          icon: getFileIcon(item),
          appId: item.appId,
          modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
        }));

        // --- START EDIT: Fetch content URLs for /Images path and its subdirectories ---
        if (currentPath === "/Images" || currentPath.startsWith("/Images/")) {
          displayFiles = await Promise.all(
            itemsMetadata.map(async (item) => {
              let contentUrl: string | undefined;
              if (!item.isDirectory && item.uuid) {
                try {
                  console.log(
                    `[useFileSystem:loadFiles] Fetching content for ${item.name}, UUID: ${item.uuid}, type: ${item.type}`
                  );
                  const contentData = await dbOperations.get<DocumentContent>(
                    STORES.IMAGES,
                    item.uuid // Use UUID instead of name
                  );

                  if (contentData?.content instanceof Blob) {
                    console.log(
                      `[useFileSystem:loadFiles] Found Blob content for ${item.name}, creating URL`
                    );
                    contentUrl = URL.createObjectURL(contentData.content);
                    console.log(
                      `[useFileSystem:loadFiles] Created URL: ${contentUrl}`
                    );
                  } else {
                    console.log(
                      `[useFileSystem:loadFiles] No Blob content found for ${item.name} with UUID ${item.uuid}`
                    );
                  }
                } catch (err) {
                  console.error(
                    `Error fetching image content for ${item.name} (UUID: ${item.uuid}):`,
                    err
                  );
                }
              }

              // Ensure the item type is properly set for image files
              const fileExt = item.name.split(".").pop()?.toLowerCase();
              const isImageFile = [
                "png",
                "jpg",
                "jpeg",
                "gif",
                "webp",
                "bmp",
              ].includes(fileExt || "");
              const type = isImageFile ? fileExt || item.type : item.type;

              return {
                ...item,
                icon: getFileIcon(item),
                appId: item.appId,
                contentUrl: contentUrl,
                type: type, // Ensure type is correctly set
                modifiedAt: item.modifiedAt
                  ? new Date(item.modifiedAt)
                  : undefined,
              };
            })
          );
        }
        // --- END EDIT ---
      }

      // a. Music Library (Virtual)
      if (currentPath === "/Music Library") {
        displayFiles = ipodTracks.map((track) => ({
          name: `${track.title}.mp3`,
          isDirectory: false,
          path: `/Music Library/${track.title}.mp3`,
          type: "Music",
          data: track,
          icon: "/icons/file-music.png",
          modifiedAt: undefined, // Virtual files don't have timestamps
        }));
      }
      // b. Video Library (Virtual)
      else if (currentPath === "/Video Library") {
        displayFiles = videoTracks.map((video) => ({
          name: `${video.title}.mov`,
          isDirectory: false,
          path: `/Video Library/${video.title}.mov`,
          type: "Video",
          data: video,
          icon: "/icons/file-video.png",
          modifiedAt: undefined, // Virtual files don't have timestamps
        }));
      }
      // c. Favorites (Virtual)
      else if (currentPath === "/Favorites") {
        displayFiles = internetExplorerStore.favorites.map((favorite) => ({
          name: `${favorite.title}.webloc`,
          isDirectory: false,
          path: `/Favorites/${favorite.title}.webloc`,
          type: "site-link",
          data: favorite,
          icon: "/icons/file-internet.png",
          modifiedAt: undefined, // Virtual files don't have timestamps
        }));
      }

      setFiles(displayFiles);
    } catch (err) {
      console.error("[useFileSystem] Error loading files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
    // Add fileStore dependency to re-run if items change
  }, [
    currentPath,
    fileStore.items,
    ipodTracks,
    videoTracks,
    internetExplorerStore.favorites,
  ]);

  // Define handleFileOpen
  const handleFileOpen = useCallback(
    async (file: ExtendedDisplayFileItem) => {
      // 1. Handle Directories (Virtual and Real)
      if (file.isDirectory) {
        if (file.type === "directory" || file.type === "directory-virtual") {
          navigateToPath(file.path);
        }
        return;
      }

      // 2. Handle Files (Fetch content if needed)
      let contentToUse: string | Blob | undefined = undefined;
      const contentUrlToUse: string | undefined = undefined;
      let contentAsString: string | undefined = undefined;

      try {
        // Fetch content from IndexedDB (Documents or Images)
        if (
          file.path.startsWith("/Documents/") ||
          file.path.startsWith("/Images/")
        ) {
          // Get the file metadata to get the UUID
          const fileMetadata = fileStore.getItem(file.path);
          if (fileMetadata?.uuid) {
            const storeName = file.path.startsWith("/Documents/")
              ? STORES.DOCUMENTS
              : STORES.IMAGES;
            const contentData = await dbOperations.get<DocumentContent>(
              storeName,
              fileMetadata.uuid // Use UUID instead of name
            );
            if (contentData) {
              contentToUse = contentData.content;
            } else {
              console.warn(
                `[useFileSystem] Content not found in IndexedDB for ${file.path} (UUID: ${fileMetadata.uuid})`
              );
              // Try to load default content lazily
              const hasDefaultContent = await ensureDefaultContent(
                file.path,
                fileMetadata.uuid
              );
              if (hasDefaultContent) {
                // Try fetching again after loading default content
                const retryData = await dbOperations.get<DocumentContent>(
                  storeName,
                  fileMetadata.uuid
                );
                if (retryData) {
                  contentToUse = retryData.content;
                  console.log(
                    `[useFileSystem] Successfully loaded default content for ${file.path}`
                  );
                }
              }
            }
          } else {
            console.warn(
              `[useFileSystem] No UUID found for file ${file.path}, cannot fetch content`
            );
          }
        }

        // Process content: Read blob to string for TextEdit, create URL for Paint
        if (contentToUse instanceof Blob) {
          if (file.path.startsWith("/Documents/")) {
            contentAsString = await contentToUse.text();
            console.log(
              `[useFileSystem] Read Blob as text for ${file.name}, length: ${contentAsString?.length}`
            );
          } else if (file.path.startsWith("/Images/")) {
            // Don't create URL here, pass the Blob itself
            // contentUrlToUse = URL.createObjectURL(contentToUse);
            // console.log(`[useFileSystem] Created Blob URL for ${file.name}: ${contentUrlToUse}`);
          }
        } else if (typeof contentToUse === "string") {
          contentAsString = contentToUse;
          console.log(
            `[useFileSystem] Using string content directly for ${file.name}, length: ${contentAsString?.length}`
          );
        }

        // 3. Launch Appropriate App
        console.log(`[useFileSystem] Preparing initialData for ${file.path}:`, {
          contentAsString,
          contentUrlToUse,
        });
        if (file.path.startsWith("/Applications/") && file.appId) {
          launchApp(file.appId as AppId);
        } else if (file.path.startsWith("/Documents/")) {
          // Check if this file is already open in a TextEdit instance
          const textEditStore = useTextEditStore.getState();
          const existingInstanceId = textEditStore.getInstanceIdByPath(
            file.path
          );

          if (existingInstanceId) {
            // File is already open - bring that window to foreground
            console.log(
              `[useFileSystem] File already open in TextEdit instance ${existingInstanceId}, bringing to foreground`
            );
            const appStore = useAppStore.getState();
            appStore.bringInstanceToForeground(existingInstanceId);
          } else {
            // File not open - launch new TextEdit instance
            launchApp("textedit", {
              initialData: { path: file.path, content: contentAsString ?? "" },
            });
          }
        } else if (file.path.startsWith("/Images/")) {
          // Pass the Blob object itself to Paint via initialData
          launchApp("paint", {
            initialData: { path: file.path, content: contentToUse },
          }); // Pass contentToUse (Blob)
        } else if (file.appId === "ipod" && file.data?.index !== undefined) {
          // iPod uses data directly from the index we calculated
          const trackIndex = file.data.index;
          setIpodIndex(trackIndex);
          setIpodPlaying(true);
          launchApp("ipod");
        } else if (file.appId === "videos" && file.data?.index !== undefined) {
          // Videos uses data directly, no change needed here for initialData
          setVideoIndex(file.data.index);
          setVideoPlaying(true);
          launchApp("videos");
        } else if (file.type === "site-link" && file.data?.url) {
          // Pass url and year via initialData instead of using IE store directly
          launchApp("internet-explorer", {
            initialData: {
              url: file.data.url,
              year: file.data.year || "current",
            },
          });
          // internetExplorerStore.setPendingNavigation(file.data.url, file.data.year || "current");
        } else {
          console.warn(
            `[useFileSystem] No handler defined for opening file type: ${file.type} at path: ${file.path}`
          );
        }
      } catch (err) {
        console.error(`[useFileSystem] Error opening file ${file.path}:`, err);
        setError(`Failed to open ${file.name}`);
      }
    },
    [
      launchApp,
      navigateToPath,
      setIpodIndex,
      setIpodPlaying,
      setVideoIndex,
      setVideoPlaying,
      internetExplorerStore,
      ensureDefaultContent,
      fileStore,
    ]
  );

  // Load files whenever dependencies change
  useEffect(() => {
    if (!options.skipLoad) {
      loadFiles();
    }
  }, [loadFiles, options.skipLoad]); // Depend only on the memoized loadFiles

  // --- handleFileSelect, Navigation Functions --- //
  const handleFileSelect = useCallback(
    (file: ExtendedDisplayFileItem | undefined) => {
      setSelectedFile(file);
      setSelectedFilePath(file?.path || null);
    },
    [setSelectedFilePath]
  );
  const navigateUp = useCallback(() => {
    if (currentPath === "/") return;
    const parentPath = getParentPath(currentPath);
    navigateToPath(parentPath); // navigateToPath is defined above
  }, [currentPath, navigateToPath, getParentPath]);
  const navigateBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);
  const navigateForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);
  const canNavigateBack = useCallback(() => historyIndex > 0, [historyIndex]);
  const canNavigateForward = useCallback(
    () => historyIndex < history.length - 1,
    [historyIndex, history]
  );

  // --- File Operations (Refactored) --- //

  const saveFile = useCallback(
    async (fileData: {
      path: string;
      name: string;
      content: string | Blob;
      type?: string;
      icon?: string;
    }) => {
      const { path, name, content } = fileData;
      console.log(`[useFileSystem:saveFile] Attempting to save: ${path}`);
      setError(undefined);

      const isDirectory = false;
      const fileType = fileData.type || getFileTypeFromExtension(name);

      // Check if file already exists to preserve UUID
      const existingItem = fileStore.getItem(path);
      const uuid = existingItem?.uuid;

      // 1. Create the full metadata object first
      const now = Date.now();

      // Calculate file size
      let fileSize: number;
      if (content instanceof Blob) {
        fileSize = content.size;
      } else if (typeof content === "string") {
        // Convert string to blob to get accurate byte size
        fileSize = new Blob([content]).size;
      } else {
        fileSize = 0;
      }

      const metadata: FileSystemItem = {
        path: path,
        name: name,
        isDirectory: isDirectory,
        type: fileType,
        status: "active", // Explicitly set status
        uuid: uuid, // Preserve existing UUID if updating
        // Set timestamps
        createdAt: existingItem?.createdAt || now,
        modifiedAt: now,
        // Include file size
        size: fileSize,
        // Now call getFileIcon with the complete metadata object
        icon:
          fileData.icon ||
          getFileIcon({
            path,
            name,
            isDirectory,
            type: fileType,
            status: "active",
          } as FileSystemItem),
      };

      // 2. Add/Update Metadata in FileStore (will generate UUID if new)
      try {
        console.log(
          `[useFileSystem:saveFile] Updating metadata store for: ${path}`
        );
        // Pass the complete metadata object to addItem
        fileStore.addItem(metadata);

        // Get the item again to get the UUID (in case it was newly generated)
        const savedItem = fileStore.getItem(path);
        if (!savedItem?.uuid) {
          throw new Error("Failed to get UUID for saved item");
        }

        console.log(
          `[useFileSystem:saveFile] Metadata store updated for: ${path} with UUID: ${savedItem.uuid}`
        );

        // 3. Save Content to IndexedDB using UUID
        const storeName = path.startsWith("/Documents/")
          ? STORES.DOCUMENTS
          : path.startsWith("/Images/")
          ? STORES.IMAGES
          : null;
        if (storeName) {
          try {
            const contentToStore: DocumentContent = {
              name: name,
              content: content,
            };
            console.log(
              `[useFileSystem:saveFile] Saving content to IndexedDB (${storeName}) with UUID: ${savedItem.uuid}`
            );
            await dbOperations.put<DocumentContent>(
              storeName,
              contentToStore,
              savedItem.uuid
            );
            console.log(
              `[useFileSystem:saveFile] Content saved to IndexedDB with UUID: ${savedItem.uuid}`
            );
          } catch (err) {
            console.error(
              `[useFileSystem:saveFile] Error saving content to IndexedDB for ${path}:`,
              err
            );
            setError(`Failed to save file content for ${name}`);
          }
        } else {
          console.warn(
            `[useFileSystem:saveFile] No valid content store for path: ${path}`
          );
        }
      } catch (metaError) {
        console.error(
          `[useFileSystem:saveFile] Error updating metadata store for ${path}:`,
          metaError
        );
        setError(`Failed to save file metadata for ${name}`);
        return;
      }
    },
    [fileStore]
  );

  const moveFile = useCallback(
    async (sourceFile: FileSystemItem, targetFolderPath: string) => {
      if (!sourceFile || sourceFile.isDirectory) {
        console.error(
          "[useFileSystem:moveFile] Invalid source file or attempting to move a directory"
        );
        setError("Cannot move this item");
        return false;
      }

      const targetFolder = fileStore.getItem(targetFolderPath);
      if (!targetFolder || !targetFolder.isDirectory) {
        console.error(
          `[useFileSystem:moveFile] Target is not a valid directory: ${targetFolderPath}`
        );
        setError("Invalid target folder");
        return false;
      }

      // Determine new path
      const newPath = `${targetFolderPath}/${sourceFile.name}`;

      // Check if destination already exists
      if (fileStore.getItem(newPath)) {
        console.error(
          `[useFileSystem:moveFile] A file with the same name already exists at destination: ${newPath}`
        );
        setError(
          "A file with the same name already exists in the destination folder"
        );
        return false;
      }

      try {
        // Determine source and target stores for content
        const sourcePath = sourceFile.path;
        const sourceStoreName = sourcePath.startsWith("/Documents/")
          ? STORES.DOCUMENTS
          : sourcePath.startsWith("/Images/")
          ? STORES.IMAGES
          : null;
        const targetStoreName = targetFolderPath.startsWith("/Documents")
          ? STORES.DOCUMENTS
          : targetFolderPath.startsWith("/Images")
          ? STORES.IMAGES
          : null;

        // If content needs to move between different stores
        if (
          sourceStoreName &&
          targetStoreName &&
          sourceStoreName !== targetStoreName &&
          sourceFile.uuid
        ) {
          // Get content from source store
          const content = await dbOperations.get<DocumentContent>(
            sourceStoreName,
            sourceFile.uuid // Use UUID
          );
          if (content) {
            // Save to target store
            await dbOperations.put<DocumentContent>(
              targetStoreName,
              content,
              sourceFile.uuid
            );
            // Delete from source store
            await dbOperations.delete(sourceStoreName, sourceFile.uuid);
          }
        }

        // Update metadata in file store
        fileStore.moveItem(sourcePath, newPath);
        console.log(
          `[useFileSystem:moveFile] Successfully moved ${sourcePath} to ${newPath}`
        );
        return true;
      } catch (err) {
        console.error(`[useFileSystem:moveFile] Error moving file: ${err}`);
        setError("Failed to move file");
        return false;
      }
    },
    [fileStore]
  );

  const renameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const itemToRename = fileStore.getItem(oldPath);
      if (!itemToRename) {
        console.error("Error: Item to rename not found in FileStore");
        setError("Failed to rename file");
        return;
      }

      const parentPath = getParentPath(oldPath);
      const newPath = `${parentPath === "/" ? "" : parentPath}/${newName}`;

      if (fileStore.getItem(newPath)) {
        console.error("Error: New path already exists in FileStore");
        setError("Failed to rename file");
        return;
      }

      // 1. Rename Metadata in FileStore (preserves UUID)
      fileStore.renameItem(oldPath, newPath, newName);

      // 2. Update content metadata (name field) in IndexedDB if it's a file with content
      if (!itemToRename.isDirectory && itemToRename.uuid) {
        const storeName = oldPath.startsWith("/Documents/")
          ? STORES.DOCUMENTS
          : oldPath.startsWith("/Images/")
          ? STORES.IMAGES
          : null;
        if (storeName) {
          try {
            const content = await dbOperations.get<DocumentContent>(
              storeName,
              itemToRename.uuid // Use UUID
            );
            if (content) {
              // Update the name field in the content
              await dbOperations.put<DocumentContent>(
                storeName,
                {
                  ...content,
                  name: newName,
                },
                itemToRename.uuid
              ); // Keep same UUID
            } else {
              console.warn(
                "Warning: Content not found in IndexedDB for renaming"
              );
            }
          } catch (err) {
            console.error("Error renaming file:", err);
            setError("Failed to rename file");
          }
        }
      }
    },
    [fileStore, getParentPath]
  );

  // --- Create Folder --- //
  const createFolder = useCallback(
    (folderData: { path: string; name: string }) => {
      const { path, name } = folderData;
      if (fileStore.getItem(path)) {
        console.error("Folder already exists:", path);
        setError("Folder already exists.");
        return;
      }
      const newFolderItem: Omit<FileSystemItem, "status"> = {
        path: path,
        name: name,
        isDirectory: true,
        type: "directory",
        icon: "/icons/directory.png",
      };
      fileStore.addItem(newFolderItem);
      setError(undefined); // Clear previous error
    },
    [fileStore]
  );

  const moveToTrash = useCallback(
    async (fileMetadata: FileSystemItem) => {
      if (
        !fileMetadata ||
        fileMetadata.path === "/" ||
        fileMetadata.path === "/Trash" ||
        fileMetadata.status === "trashed"
      )
        return;

      // 1. Mark item as trashed in FileStore
      fileStore.removeItem(fileMetadata.path);

      // 2. Move Content to TRASH DB store
      const storeName = fileMetadata.path.startsWith("/Documents/")
        ? STORES.DOCUMENTS
        : fileMetadata.path.startsWith("/Images/")
        ? STORES.IMAGES
        : null;
      if (storeName && !fileMetadata.isDirectory && fileMetadata.uuid) {
        try {
          const content = await dbOperations.get<DocumentContent>(
            storeName,
            fileMetadata.uuid // Use UUID
          );
          if (content) {
            // Store content in TRASH store using UUID as key
            await dbOperations.put<DocumentContent>(
              STORES.TRASH,
              content,
              fileMetadata.uuid
            );
            await dbOperations.delete(storeName, fileMetadata.uuid);
            console.log(
              `[useFileSystem] Moved content for ${fileMetadata.name} from ${storeName} to Trash DB with UUID ${fileMetadata.uuid}.`
            );
          } else {
            console.warn(
              `[useFileSystem] Content not found for ${fileMetadata.name} (UUID: ${fileMetadata.uuid}) in ${storeName} during move to trash.`
            );
          }
        } catch (err) {
          console.error("Error moving content to trash:", err);
          setError("Failed to move content to trash");
        }
      }
    },
    [fileStore]
  );

  const restoreFromTrash = useCallback(
    async (itemToRestore: ExtendedDisplayFileItem) => {
      const fileMetadata = fileStore.getItem(itemToRestore.path);
      if (
        !fileMetadata ||
        fileMetadata.status !== "trashed" ||
        !fileMetadata.originalPath
      ) {
        console.error(
          "Cannot restore: Item not found in store or not in trash."
        );
        setError("Cannot restore item.");
        return;
      }

      // 1. Restore metadata in FileStore
      fileStore.restoreItem(fileMetadata.path);

      // 2. Move Content from TRASH DB store back
      const targetStoreName = fileMetadata.originalPath.startsWith(
        "/Documents/"
      )
        ? STORES.DOCUMENTS
        : fileMetadata.originalPath.startsWith("/Images/")
        ? STORES.IMAGES
        : null;
      if (targetStoreName && !fileMetadata.isDirectory && fileMetadata.uuid) {
        try {
          const content = await dbOperations.get<DocumentContent>(
            STORES.TRASH,
            fileMetadata.uuid // Use UUID
          );
          if (content) {
            await dbOperations.put<DocumentContent>(
              targetStoreName,
              content,
              fileMetadata.uuid
            );
            await dbOperations.delete(STORES.TRASH, fileMetadata.uuid); // Delete content from trash store
            console.log(
              `[useFileSystem] Restored content for ${fileMetadata.name} from Trash DB to ${targetStoreName} with UUID ${fileMetadata.uuid}.`
            );
          } else {
            console.warn(
              `[useFileSystem] Content not found for ${fileMetadata.name} (UUID: ${fileMetadata.uuid}) in Trash DB during restore.`
            );
          }
        } catch (err) {
          console.error("Error restoring content from trash:", err);
          setError("Failed to restore content from trash");
        }
      }
    },
    [fileStore]
  );

  const emptyTrash = useCallback(async () => {
    // 1. Permanently delete metadata from FileStore and get UUIDs of files whose content needs deletion
    const contentUUIDsToDelete = fileStore.emptyTrash();

    // 2. Clear corresponding content from TRASH IndexedDB store
    try {
      // Delete content based on UUIDs collected from fileStore.emptyTrash()
      for (const uuid of contentUUIDsToDelete) {
        await dbOperations.delete(STORES.TRASH, uuid);
      }
      console.log("[useFileSystem] Cleared trash content from IndexedDB.");
    } catch (err) {
      console.error("Error clearing trash content from IndexedDB:", err);
      setError("Failed to empty trash storage.");
    }
  }, [fileStore]);

  // --- Format File System (Refactored) --- //
  const formatFileSystem = useCallback(async () => {
    try {
      await Promise.all([
        dbOperations.clear(STORES.IMAGES),
        dbOperations.clear(STORES.TRASH),
        dbOperations.clear(STORES.CUSTOM_WALLPAPERS),
      ]);
      await dbOperations.clear(STORES.DOCUMENTS);

      // Clear the migration flag so UUID migration will run again after reset
      localStorage.removeItem(UUID_MIGRATION_KEY);
      // Clear the size/timestamp sync flag so it will run again after reset
      localStorage.removeItem("ryos:file-size-timestamp-sync-v1");

      // Reset metadata store (this will trigger re-initialization with new UUIDs)
      fileStore.reset();

      // Re-initialization will happen automatically via the store's onRehydrateStorage
      // The default files will be loaded with new UUIDs by initializeLibrary

      setCurrentPath("/");
      setHistory(["/"]);
      setHistoryIndex(0);
      setSelectedFile(undefined);
      setError(undefined);
    } catch (err) {
      console.error("Error formatting file system:", err);
      setError("Failed to format file system");
    }
  }, [fileStore]);

  // Calculate trash count based on store data
  const trashItemsCount = fileStore.getItemsInPath("/Trash").length;

  // --- One-time sync for file sizes and timestamps --- //
  useEffect(() => {
    const syncFileSizesAndTimestamps = async () => {
      // Check if we've already done this sync
      const syncKey = "ryos:file-size-timestamp-sync-v1";
      if (localStorage.getItem(syncKey)) {
        return;
      }

      console.log(
        "[useFileSystem] Starting one-time file size and timestamp sync..."
      );

      try {
        const fileStoreState = useFilesStore.getState();
        const allItems = Object.values(fileStoreState.items);

        // Process all files (not directories)
        for (const item of allItems) {
          if (!item.isDirectory && item.uuid && item.status === "active") {
            let updateNeeded = false;
            const updates: Partial<FileSystemItem> = {};

            // Calculate size if missing
            if (item.size === undefined || item.size === null) {
              const storeName = item.path.startsWith("/Documents/")
                ? STORES.DOCUMENTS
                : item.path.startsWith("/Images/")
                ? STORES.IMAGES
                : null;

              if (storeName) {
                try {
                  const content = await dbOperations.get<DocumentContent>(
                    storeName,
                    item.uuid
                  );

                  if (content?.content) {
                    let size: number;
                    if (content.content instanceof Blob) {
                      size = content.content.size;
                    } else if (typeof content.content === "string") {
                      // Convert string to blob to get accurate byte size
                      size = new Blob([content.content]).size;
                    } else {
                      size = 0;
                    }

                    updates.size = size;
                    updateNeeded = true;
                    console.log(
                      `[useFileSystem] Updated size for ${item.path}: ${size} bytes`
                    );
                  }
                } catch (err) {
                  console.warn(
                    `[useFileSystem] Could not get content for ${item.path}:`,
                    err
                  );
                }
              }
            }

            // Set reasonable timestamps if missing
            if (!item.createdAt || !item.modifiedAt) {
              const now = Date.now();
              // For default files, use a date in the past
              const isDefaultFile = [
                "/Documents/README.md",
                "/Documents/Quick Tips.md",
                "/Images/steve-jobs.png",
                "/Images/susan-kare.png",
              ].includes(item.path);

              const baseTime = isDefaultFile
                ? now - 30 * 24 * 60 * 60 * 1000 // 30 days ago for default files
                : now;

              if (!item.createdAt) {
                updates.createdAt = baseTime;
                updateNeeded = true;
              }
              if (!item.modifiedAt) {
                updates.modifiedAt = baseTime;
                updateNeeded = true;
              }
            }

            // Apply updates if needed
            if (updateNeeded) {
              fileStoreState.addItem({
                ...item,
                ...updates,
              });
            }
          }
        }

        // Mark sync as complete
        localStorage.setItem(syncKey, "done");
        console.log("[useFileSystem] File size and timestamp sync complete");
      } catch (err) {
        console.error(
          "[useFileSystem] Error during file size/timestamp sync:",
          err
        );
      }
    };

    // Run sync after a short delay to avoid blocking initial render
    const timer = setTimeout(syncFileSizesAndTimestamps, 500);
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  // --- UUID Migration Effect (Runs ONLY ONCE globally) --- //
  useEffect(() => {
    if (isUUIDMigrationDone()) {
      return;
    }

    // Check if the file store has been loaded/migrated
    const checkAndRunMigration = async () => {
      const fileStoreState = useFilesStore.getState();

      // Wait for the store to be loaded
      if (fileStoreState.libraryState === "uninitialized") {
        console.log(
          "[useFileSystem] Waiting for file store to initialize before UUID migration..."
        );
        return;
      }

      // Mark as done to prevent multiple runs
      localStorage.setItem(UUID_MIGRATION_KEY, "completed");

      console.log(
        "[useFileSystem] File store is ready, running UUID migration..."
      );

      // Run migration asynchronously
      try {
        await migrateIndexedDBToUUIDs();
      } catch (err) {
        console.error("[useFileSystem] UUID migration failed:", err);
      }
    };

    // Check immediately
    checkAndRunMigration();

    // Also subscribe to store changes in case it's not ready yet
    const unsubscribe = useFilesStore.subscribe((state) => {
      if (!isUUIDMigrationDone() && state.libraryState !== "uninitialized") {
        checkAndRunMigration();
      }
    });

    return () => unsubscribe();
  }, []);

  return {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash: (file: ExtendedDisplayFileItem) => {
      const itemMeta = fileStore.getItem(file.path);
      if (itemMeta) {
        moveToTrash(itemMeta);
      } else {
        /* ... error ... */
      }
    },
    restoreFromTrash,
    emptyTrash,
    trashItemsCount, // Provide count derived from store
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile,
    setSelectedFile: handleFileSelect,
    renameFile,
    createFolder,
    formatFileSystem,
    moveFile,
  };
}
