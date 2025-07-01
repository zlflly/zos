import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { helpItems, appMetadata } from "..";
import { PhotoBoothMenuBar } from "./PhotoBoothMenuBar";
import { AppProps } from "../../base/types";
import { Images, Timer, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSound, Sounds } from "@/hooks/useSound";
import { Webcam } from "@/components/Webcam";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { usePhotoBoothStore } from "@/stores/usePhotoBoothStore";

interface Effect {
  name: string;
  filter: string;
}

interface PhotoReference {
  filename: string;
  path: string;
  timestamp: number;
}

// Split effects into two categories
const cssFilters: Effect[] = [
  { name: "Rainbow", filter: "hue-rotate(180deg) saturate(200%)" },
  { name: "Vibrant", filter: "saturate(200%) contrast(150%)" },
  { name: "Cold Blue", filter: "hue-rotate(240deg) saturate(150%)" },
  { name: "High Contrast", filter: "contrast(200%) brightness(110%)" },
  { name: "Normal", filter: "none" },
  { name: "Vintage", filter: "sepia(80%) brightness(90%) contrast(120%)" },
  { name: "X-Ray", filter: "invert(100%) hue-rotate(180deg) hue-rotate(180deg)" },
  { name: "Neon", filter: "brightness(120%) contrast(120%) saturate(200%) hue-rotate(310deg)" },
  { name: "Black & White", filter: "brightness(90%) hue-rotate(20deg) saturate(0%)" },
];

const distortionFilters: Effect[] = [
  { name: "Bulge", filter: "bulge(-0.5)" },
  { name: "Stretch", filter: "stretch(1.0)" },
  { name: "Pinch", filter: "pinch(2.0)" },
  { name: "Twirl", filter: "twist(-8.0)" },
  { name: "Fish Eye", filter: "fisheye(1.5)" },
  { name: "Squeeze", filter: "squeeze(1.0)" },
  // New exciting effects
  { name: "Kaleidoscope", filter: "kaleidoscope(0.5)" },
  { name: "Ripple", filter: "ripple(1.5)" },
  { name: "Glitch", filter: "glitch(2.0)" },
];

// Combined array for compatibility with existing code
const effects: Effect[] = [...cssFilters, ...distortionFilters];

// Add function to detect swipe gestures
function useSwipeDetection(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  
  // Minimum distance required for a swipe
  const MIN_SWIPE_DISTANCE = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isSwipe = Math.abs(distance) > MIN_SWIPE_DISTANCE;
    
    if (isSwipe) {
      if (distance > 0) {
        // Swipe left
        onSwipeLeft();
      } else {
        // Swipe right
        onSwipeRight();
      }
    }
    
    // Reset
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

export function PhotoBoothComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [showPhotoStrip, setShowPhotoStrip] = useState(false);
  const [currentEffectsPage, setCurrentEffectsPage] = useState(0); // 0 = CSS filters, 1 = distortions
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [selectedEffect, setSelectedEffect] = useState<Effect>(
    effects.find((effect) => effect.name === "Normal") || effects[0]
  );
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const { photos, addPhoto, addPhotos, clearPhotos } =
    usePhotoBoothStore();
  const [isMultiPhotoMode, setIsMultiPhotoMode] = useState(false);
  const [multiPhotoCount, setMultiPhotoCount] = useState(0);
  const [multiPhotoTimer, setMultiPhotoTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const [currentPhotoBatch, setCurrentPhotoBatch] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const { play: playShutter } = useSound(Sounds.PHOTO_SHUTTER, 0.4);
  const [newPhotoIndex, setNewPhotoIndex] = useState<number | null>(null);
  const [mainStream, setMainStream] = useState<MediaStream | null>(null);
  const { saveFile, files } = useFileSystem("/Images");

  // Add a small delay before showing photo strip to prevent flickering
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    if (showPhotoStrip && isInitialLoad) {
      // Let the component fully mount before showing photostrip
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showPhotoStrip, isInitialLoad]);

  useEffect(() => {
    // Start camera when window opens or app comes to foreground
    if (isWindowOpen) {
      if (isForeground) {
        // Check if stream is active, if not, restart it
        const isStreamActive =
          stream &&
          stream.active &&
          stream.getTracks().some((track) => track.readyState === "live");

        if (!isStreamActive) {
          console.log("Starting/restarting camera");
          startCamera();
        }
      } else {
        // App going to background - we'll keep the stream alive
        console.log("App in background - stream will be maintained");
      }
    }

    // Only clean up when window actually closes
    return () => {
      if (!isWindowOpen) {
        stopCamera();
      }
    };
  }, [isWindowOpen, isForeground, stream]);

  // Fully stop any active media streams and clear timers
  const stopCamera = () => {
    // Aggregate all known streams so we can safely stop them
    const streams: MediaStream[] = [];

    if (stream) streams.push(stream);
    // `mainStream` might be the same as `stream`, but if it is different we
    // still want to make sure we stop its tracks as well.
    if (mainStream && mainStream !== stream) streams.push(mainStream);

    streams.forEach((s) => {
      s.getTracks().forEach((track) => track.stop());
    });

    // Clear local references so React knows the streams are gone
      setStream(null);
    setMainStream(null);

    // Clear any running interval that might be taking additional photos
    if (multiPhotoTimer) {
      clearInterval(multiPhotoTimer);
      setMultiPhotoTimer(null);
    }
  };

  // Ensure that we always stop the camera when the Photo Booth window is
  // closed.  Returning `null` from the component hides the UI but does **not**
  // unmount the component itself, so we need a dedicated effect that reacts
  // to `isWindowOpen` changes and performs cleanup.
  useEffect(() => {
    if (!isWindowOpen) {
      stopCamera();
    }

    // It's safe to omit a cleanup function here because `stopCamera` already
    // handles stopping tracks and clearing timers – calling it a second time
    // would simply be a no-op.
  }, [isWindowOpen]);

  // Detect iOS devices which need special handling
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Detect Chrome
  const isChrome =
    /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);

  useEffect(() => {
    // Print device info on mount
    console.log("Device info:", {
      userAgent: navigator.userAgent,
      isIOS,
      isChrome,
      isSecureContext: window.isSecureContext,
    });
  }, []);

  // Force visibility refresh for Chrome
  useEffect(() => {
    if (!isChrome || !videoRef.current || !stream) return;

    console.log("Applying Chrome-specific visibility fixes");

    // Force visibility in Chrome by cycling CSS properties
    const forceVisibility = () => {
      if (!videoRef.current) return;

      // Force visibility by manipulating CSS properties
      videoRef.current.style.visibility = "hidden";
      videoRef.current.style.display = "none";

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.style.visibility = "visible";
          videoRef.current.style.display = "block";

          // Some Chrome versions need this nudge
          videoRef.current.style.opacity = "0.99";
          setTimeout(() => {
            if (videoRef.current) videoRef.current.style.opacity = "1";
          }, 50);
        }
      }, 50);
    };

    // Apply fix after a delay to let rendering settle
    setTimeout(forceVisibility, 300);
    setTimeout(forceVisibility, 1000);
  }, [stream, isChrome]);

  // Add event listener for the video element to handle Safari initialization
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return;

    // Track if video is actually playing
    let isPlaying = false;

    const handleCanPlay = () => {
      console.log("Video can play now");

      // iOS Safari needs display none/block toggle to render properly sometimes
      if (isIOS) {
        videoElement.style.display = "none";
        // Force reflow
        void videoElement.offsetHeight;
        videoElement.style.display = "block";
      }

      // Force play (required for mobile browsers)
      videoElement
        .play()
        .then(() => {
          isPlaying = true;
          console.log("Video playing successfully");
        })
        .catch((e) => {
          console.error("Play error:", e);
          isPlaying = false;
        });
    };

    // Recovery check - if video isn't playing after a moment, try again
    const recoveryTimer = setTimeout(() => {
      if (!isPlaying && videoElement && stream.active) {
        console.log("Attempting recovery of video playback");
        videoElement
          .play()
          .catch((e) => console.error("Recovery attempt failed:", e));
      }
    }, 2000);

    videoElement.addEventListener("canplay", handleCanPlay);

    return () => {
      videoElement.removeEventListener("canplay", handleCanPlay);
      clearTimeout(recoveryTimer);
    };
  }, [stream]);

  // Fix playback issues on Chrome in production
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    console.log("Stream connected, verifying video display");

    // Force video element to reinitialize
    const videoEl = videoRef.current;

    // Enhanced play function with logging
    const forceVideoPlay = () => {
      if (!videoEl) return;

      // Display detailed info about video element
      console.log("Video element status:", {
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
        paused: videoEl.paused,
        readyState: videoEl.readyState,
        networkState: videoEl.networkState,
      });

      // In Chrome, detaching and reattaching can help
      const currentStream = videoEl.srcObject;
      videoEl.srcObject = null;

      // Force layout reflow
      void videoEl.offsetHeight;

      // Reattach stream and force play
      setTimeout(() => {
        if (videoEl && currentStream) {
          videoEl.srcObject = currentStream;
          videoEl
            .play()
            .then(() => console.log("Video forced to play successfully"))
            .catch((err) => console.error("Force play failed:", err));
        }
      }, 50);
    };

    // Call immediately and again after a delay
    forceVideoPlay();
    setTimeout(forceVideoPlay, 1000);

    // Add explicit metadata event listener
    const handleLoadedMetadata = () => {
      console.log("Video metadata loaded, dimensions:", {
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
      });

      if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
        console.log(
          "Metadata loaded but dimensions still zero, applying fix..."
        );
        // Force dimensions if needed
        if (videoEl.style.width === "" && videoEl.style.height === "") {
          // Try to set reasonable defaults based on container
          videoEl.style.width = "100%";
          videoEl.style.height = "100%";
        }

        // Force reflow and play
        void videoEl.offsetHeight;
        videoEl
          .play()
          .catch((e) => console.error("Play after metadata error:", e));
      }
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stream]);

  // Add effect to get available cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(
          (device) => device.kind === "videoinput"
        );
        setAvailableCameras(cameras);

        // If no camera is selected and cameras are available, select the first one
        if (!selectedCameraId && cameras.length > 0) {
          setSelectedCameraId(cameras[0].deviceId);
        }
      } catch (error) {
        console.error("Error getting cameras:", error);
      }
    };

    getCameras();
  }, []);

  // Update startCamera to use selected camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsLoadingCamera(true);

      // Production-specific debugging
      console.log("Environment:", {
        protocol: window.location.protocol,
        isSecure: window.isSecureContext,
        hostname: window.location.hostname,
        userAgent: navigator.userAgent,
      });

      // Strict check for secure context - required for camera in production
      if (!window.isSecureContext) {
        throw new DOMException(
          "Camera requires a secure context (HTTPS)",
          "SecurityError"
        );
      }

      // Always stop the current stream before starting a new one
      if (stream) {
        stopCamera();
      }

      // Diagnostic check for mediaDevices API
      if (!navigator.mediaDevices) {
        console.error("mediaDevices API not available");
        throw new Error("Camera API not available");
      }

      // Use specific constraints with ideal dimensions and selected camera
      const constraints = {
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      };

      console.log("Requesting camera access with constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      console.log(
        "Camera access granted:",
        mediaStream.active,
        "Video tracks:",
        mediaStream.getVideoTracks().length
      );

      // Verify track settings - this helps debug Chrome-specific issues
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        console.log("Video track:", videoTrack.label);

        try {
          const settings = videoTrack.getSettings();
          console.log("Track settings:", settings);
        } catch (e) {
          console.warn("Couldn't read track settings:", e);
        }
      }

      setStream(mediaStream);
    } catch (error) {
      console.error("Camera error:", error);
      let errorMessage = "Could not access camera";

      if (error instanceof DOMException) {
        console.log("DOMException type:", error.name);
        if (error.name === "NotAllowedError") {
          errorMessage = "Camera permission denied";
        } else if (error.name === "NotFoundError") {
          errorMessage = "No camera found";
        } else if (error.name === "SecurityError") {
          errorMessage = "Camera requires HTTPS";
        } else {
          errorMessage = `Camera error: ${error.name}`;
        }
      }

      setCameraError(errorMessage);
    } finally {
      setIsLoadingCamera(false);
    }
  };

  const handlePhoto = (photoDataUrl: string) => {
    // Trigger flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 800);

    // Play shutter sound
    playShutter();

    // Convert base64 data URL to Blob for file system storage
    const base64Data = photoDataUrl.split(",")[1];
    const mimeType = photoDataUrl.split(",")[0].split(":")[1].split(";")[0];
    const byteCharacters = atob(base64Data);
    const byteArrays = [];

    for (let i = 0; i < byteCharacters.length; i += 512) {
      const slice = byteCharacters.slice(i, i + 512);
      const byteNumbers = new Array(slice.length);
      for (let j = 0; j < slice.length; j++) {
        byteNumbers[j] = slice.charCodeAt(j);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Generate unique filename with timestamp and correct extension
    const timestamp = Date.now();
    const timestampStr = new Date(timestamp)
      .toISOString()
      .replace(/[-:.]/g, "")
      .substring(0, 15);
    const fileExtension = mimeType === "image/jpeg" ? ".jpg" : ".png";
    const filename = `photo_${timestampStr}${fileExtension}`;

    // Create file item with Blob content
    const fileItem = {
      name: filename,
      content: blob,
      contentUrl: blobUrl,
      type: mimeType,
      path: `/Images/${filename}`,
      isDirectory: false,
      size: blob.size,
      modifiedAt: new Date(),
    };

    // Save to the file system using hook
    saveFile(fileItem);

    // Create a reference to the saved photo
    const photoRef: PhotoReference = {
      filename,
      path: `/Images/${filename}`,
      timestamp,
    };

    // Add the new photo reference to the photos array
    addPhoto(photoRef);

    setLastPhoto(photoDataUrl); // Use data URL for lastPhoto preview
    setNewPhotoIndex(photos.length);
    setShowThumbnail(true);

    setTimeout(() => {
      setShowThumbnail(false);
      setTimeout(() => setNewPhotoIndex(null), 500);
    }, 2000);
  };

  const startMultiPhotoSequence = () => {
    setIsMultiPhotoMode(true);
    setMultiPhotoCount(0);
    setCurrentPhotoBatch([]);

    // Take 4 photos with a 1-second interval
    const timer = setInterval(() => {
      setMultiPhotoCount((count) => {
        const newCount = count + 1;

        if (newCount <= 4) {
          // Trigger photo capture
          const event = new CustomEvent("webcam-capture");
          window.dispatchEvent(event);
        }

        if (newCount === 4) {
          clearInterval(timer);
          setIsMultiPhotoMode(false);

          // After the sequence completes, process batch photos and convert to references
          // This happens after all photos are taken
          const batchWithReferences = currentPhotoBatch.map((dataUrl) => {
            // Convert to blob and save file similar to handlePhoto
            const base64Data = dataUrl.split(",")[1];
            const mimeType = dataUrl.split(",")[0].split(":")[1].split(";")[0];
            const byteCharacters = atob(base64Data);
            const byteArrays = [];

            for (let i = 0; i < byteCharacters.length; i += 512) {
              const slice = byteCharacters.slice(i, i + 512);
              const byteNumbers = new Array(slice.length);
              for (let j = 0; j < slice.length; j++) {
                byteNumbers[j] = slice.charCodeAt(j);
              }
              const byteArray = new Uint8Array(byteNumbers);
              byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);

            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const timestampStr = new Date(timestamp)
              .toISOString()
              .replace(/[-:.]/g, "")
              .substring(0, 15);
            const fileExtension = mimeType === "image/jpeg" ? ".jpg" : ".png";
            const filename = `photo_${timestampStr}${fileExtension}`;

            // Create file item with Blob content
            const fileItem = {
              name: filename,
              content: blob,
              contentUrl: blobUrl,
              type: mimeType,
              path: `/Images/${filename}`,
              isDirectory: false,
              size: blob.size,
              modifiedAt: new Date(),
            };

            // Save to the file system
            saveFile(fileItem);

            // Return reference to the saved photo
            return {
              filename,
              path: `/Images/${filename}`,
              timestamp,
            };
          });

          // Update photos state with the new references
          addPhotos(batchWithReferences);

          // Show thumbnail animation for the last photo in the sequence
          if (currentPhotoBatch.length > 0) {
            setLastPhoto(currentPhotoBatch[currentPhotoBatch.length - 1]);
            setShowThumbnail(true);
            setTimeout(() => setShowThumbnail(false), 3000);
          }
        }

        return newCount;
      });
    }, 1000);

    setMultiPhotoTimer(timer);

    // Take the first photo immediately
    const event = new CustomEvent("webcam-capture");
    window.dispatchEvent(event);
  };

  const handleClearPhotos = () => {
    clearPhotos();
    setCurrentPhotoBatch([]);
  };

  const handleExportPhotos = () => {
    // TODO: Implement photo export functionality
    console.log("Export photos");
  };

  const toggleEffects = () => {
    setShowEffects(!showEffects);
  };

  const togglePhotoStrip = () => {
    setShowPhotoStrip(!showPhotoStrip);
  };

  const toggleEffectsPage = (pageIndex: number) => {
    setCurrentEffectsPage(pageIndex);
  };

  // Handlers for page navigation
  const goToNextPage = () => {
    setCurrentEffectsPage(1);
  };

  const goToPrevPage = () => {
    setCurrentEffectsPage(0);
  };

  // Setup swipe handlers
  const swipeHandlers = useSwipeDetection(goToNextPage, goToPrevPage);

  // Add handler for camera selection
  const handleCameraSelect = async (deviceId: string) => {
    console.log("Switching to camera:", deviceId);
    setSelectedCameraId(deviceId);
    await startCamera();
  };

  // Add useEffect for cleanup
  useEffect(() => {
    // Cleanup when component unmounts
    return () => {
      // We don't need to revoke any URLs since we're using data URLs in the photos array
      // Only revoke lastPhoto URL if it's a blob URL
      if (lastPhoto && lastPhoto.startsWith("blob:")) {
        URL.revokeObjectURL(lastPhoto);
      }
    };
  }, [lastPhoto]);

  // Update the photo-taken event handler
  useEffect(() => {
    const handlePhotoTaken = (e: CustomEvent) => {
      // Skip if we're not in multi-photo mode
      if (!isMultiPhotoMode) return;

      // Get the photo data URL from the event
      const photoDataUrl = e.detail;
      if (!photoDataUrl || typeof photoDataUrl !== "string") {
        console.error("Invalid photo data in photo-taken event");
        return;
      }

      // Add to batch
      setCurrentPhotoBatch((prev) => [...prev, photoDataUrl]);
    };

    // Add event listener
    window.addEventListener("photo-taken", handlePhotoTaken as EventListener);

    return () => {
      window.removeEventListener(
        "photo-taken",
        handlePhotoTaken as EventListener
      );
    };
  }, [isMultiPhotoMode]);

  // Filter photos that actually exist in the file system
  const validPhotos = photos.filter((photo) =>
    files.some((file) => file.name === photo.filename)
  );

  if (!isWindowOpen) return null;

  return (
    <>
      <PhotoBoothMenuBar
        onClose={onClose}
        onShowHelp={() => setShowHelp(true)}
        onShowAbout={() => setShowAbout(true)}
        onClearPhotos={handleClearPhotos}
        onExportPhotos={handleExportPhotos}
        effects={effects}
        selectedEffect={selectedEffect}
        onEffectSelect={setSelectedEffect}
        availableCameras={availableCameras}
        selectedCameraId={selectedCameraId}
        onCameraSelect={handleCameraSelect}
      />
      <WindowFrame
        title="Photo Booth"
        onClose={onClose}
        isForeground={isForeground}
        appId="photo-booth"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col w-full h-full bg-neutral-500 max-h-full overflow-hidden">
          {/* Camera view area - takes available space but doesn't overflow */}
          <div
            className={`flex-1 min-h-0 relative ${
              !stream || isLoadingCamera || cameraError
                ? "pointer-events-none opacity-50"
                : ""
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Webcam
                onPhoto={(photoDataUrl) => {
                  // Only process if not in preview
                  if (photoDataUrl) {
                    handlePhoto(photoDataUrl);
                  }
                }}
                className="w-full h-full"
                filter={selectedEffect.filter}
                onStreamReady={setMainStream}
                selectedCameraId={selectedCameraId}
              />

              {/* Camera flash effect */}
              <AnimatePresence>
                {isFlashing && (
                  <motion.div
                    className="absolute inset-0 bg-white"
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                  />
                )}
              </AnimatePresence>

              {/* Multi-photo countdown overlay */}
              <AnimatePresence>
                {isMultiPhotoMode && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="text-8xl font-bold text-white drop-shadow-lg">
                      {multiPhotoCount < 4 ? 4 - multiPhotoCount : ""}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Effects overlay */}
              <AnimatePresence>
                {showEffects && (
                  <motion.div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...swipeHandlers}
                  >
                    <motion.div
                      className="grid grid-cols-3 gap-4 p-4 w-full max-w-4xl max-h-[calc(100%-40px)] overflow-auto"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                      }}
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      {(currentEffectsPage === 0 ? cssFilters : distortionFilters).map((effect) => (
                        <motion.div
                          key={effect.name}
                          className={`relative aspect-video overflow-hidden rounded-lg cursor-pointer border-2 ${
                            selectedEffect.name === effect.name
                              ? "border-white"
                              : "border-transparent"
                          }`}
                          whileHover={{
                            scale: 1.05,
                            transition: { duration: 0.15 },
                          }}
                          whileTap={{
                            scale: 0.95,
                            transition: { duration: 0.1 },
                          }}
                          onClick={() => {
                            setSelectedEffect(effect);
                            setShowEffects(false);
                          }}
                        >
                          <Webcam
                            isPreview
                            filter={effect.filter}
                            className="w-full h-full"
                            sharedStream={mainStream}
                          />
                          <div
                            className="absolute bottom-0 left-0 right-0 text-center py-1.5 text-white font-geneva-12 text-[12px]"
                            style={{
                              textShadow:
                                "0px 0px 2px black, 0px 0px 2px black, 0px 0px 2px black",
                            }}
                          >
                            {effect.name}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Pagination dots - smaller with less space */}
                    <div className="flex items-center justify-center mt-2 space-x-2">
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(0)}
                      >
                        <div className={`w-2 h-2 rounded-full ${currentEffectsPage === 0 ? 'bg-white' : 'bg-white/40'}`} />
                      </button>
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(1)}
                      >
                        <div className={`w-2 h-2 rounded-full ${currentEffectsPage === 1 ? 'bg-white' : 'bg-white/40'}`} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Photo strip preview - positioned in camera view area, but above bottom controls */}
              <AnimatePresence mode="wait">
                {showPhotoStrip && validPhotos.length > 0 && !isInitialLoad && (
                  <motion.div
                    className="absolute bottom-0 inset-x-0 w-full bg-white/40 backdrop-blur-sm p-1 overflow-x-auto"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 50, opacity: 0 }}
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: 0.2,
                    }}
                  >
                    <div className="flex flex-row space-x-1 h-20 w-max">
                      {[...validPhotos].reverse().map((photo, index) => {
                        // Calculate the original index (before reversing)
                        const originalIndex = validPhotos.length - 1 - index;
                        // Check if this is the new photo that was just added
                        const isNewPhoto = originalIndex === newPhotoIndex;

                        // Find the matching file in the file system
                        const matchingFile = files.find(
                          (file) => file.name === photo.filename
                        );

                        // Skip if file not found in the file system
                        if (!matchingFile || !matchingFile.contentUrl)
                          return null;

                        return (
                          <motion.div
                            key={`photo-${photo.filename}`}
                            className="h-full flex-shrink-0"
                            initial={
                              isNewPhoto
                                ? { scale: 0.5, opacity: 0 }
                                : { opacity: 1, scale: 1 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            layout
                            transition={{
                              type: "spring",
                              damping: 25,
                              stiffness: 400,
                              duration: isNewPhoto ? 0.4 : 0,
                            }}
                          >
                            <img
                              src={matchingFile.contentUrl}
                              alt={`Photo ${originalIndex}`}
                              className="h-full w-auto object-contain cursor-pointer transition-opacity hover:opacity-80"
                              onClick={() => {
                                // Create an anchor element to download the image
                                const link = document.createElement("a");
                                link.href = matchingFile.contentUrl || "";
                                link.download = matchingFile.name;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Fixed bottom control bar that always takes full width without overflowing */}
          <div className="flex-shrink-0 w-full bg-black/70 backdrop-blur-md px-6 py-4 flex justify-between items-center z-[60]">
            <div className="flex space-x-3 relative">
              {/* Thumbnail animation */}
              <AnimatePresence>
                {showThumbnail && lastPhoto && !showPhotoStrip && (
                  <motion.div
                    className="absolute -top-24 left-0 pointer-events-none z-[100]"
                    initial={{ opacity: 0, y: 10, scale: 0.3 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      y: 60,
                      scale: 0.2,
                      x: -16,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                    }}
                    style={{
                      originX: "0",
                      originY: "1",
                    }}
                  >
                    <motion.img
                      src={lastPhoto}
                      alt="Last photo thumbnail"
                      className="h-20 w-auto object-cover rounded-md shadow-md border-2 border-white"
                      initial={{ rotateZ: 0 }}
                      animate={{ rotateZ: 0 }}
                      exit={{ rotateZ: 5 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 10,
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                className={`h-10 w-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white relative overflow-hidden ${
                  validPhotos.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                onClick={togglePhotoStrip}
                disabled={validPhotos.length === 0}
              >
                <Images size={18} />
              </button>
              <button
                className="h-10 w-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white"
                onClick={startMultiPhotoSequence}
                disabled={isMultiPhotoMode}
              >
                <Timer size={18} />
              </button>
            </div>

            <Button
              onClick={
                isMultiPhotoMode
                  ? () => {}
                  : () => {
                      const event = new CustomEvent("webcam-capture");
                      window.dispatchEvent(event);
                    }
              }
              className={`rounded-full h-14 w-14 [&_svg]:size-5 ${
                isMultiPhotoMode
                  ? `bg-gray-500 cursor-not-allowed`
                  : `bg-red-500 hover:bg-red-600`
              }`}
              disabled={isMultiPhotoMode}
            >
              <Camera stroke="white" />
            </Button>

            <Button
              onClick={toggleEffects}
              className="h-10 px-5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[16px]"
            >
              Effects
            </Button>
          </div>

          <HelpDialog
            isOpen={showHelp}
            onOpenChange={setShowHelp}
            helpItems={helpItems}
            appName="Photo Booth"
          />
          <AboutDialog
            isOpen={showAbout}
            onOpenChange={setShowAbout}
            metadata={appMetadata}
          />
        </div>
      </WindowFrame>
    </>
  );
}
