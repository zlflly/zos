import { useEffect, useRef, useState, useMemo } from "react";
import { CameraOff } from "lucide-react";
import { runFilter, mapCssFilterStringToUniforms } from "@/lib/webglFilterRunner";
import fragSrc from "@/lib/shaders/basicFilter.frag?raw";

interface WebcamProps {
  onPhoto?: (photoDataUrl: string) => void;
  className?: string;
  isPreview?: boolean;
  filter?: string;
  onStreamReady?: (stream: MediaStream) => void;
  sharedStream?: MediaStream | null;
  selectedCameraId?: string | null;
}

export function Webcam({
  onPhoto,
  className = "",
  isPreview = false,
  filter = "none",
  onStreamReady,
  sharedStream,
  selectedCameraId,
}: WebcamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  // Detect if the current filter string requires WebGL preview (distortion keywords)
  const needsWebGLPreview = useMemo(() => {
    return /bulge|pinch|twist|fisheye|stretch|squeeze|tunnel|kaleidoscope|ripple|glitch/i.test(filter);
  }, [filter]);

  // Start camera when component mounts or shared stream changes
  useEffect(() => {
    if (!isPreview) {
      startCamera();
      return () => stopCamera();
    } else if (sharedStream) {
      setStream(sharedStream);
      if (videoRef.current) {
        videoRef.current.srcObject = sharedStream;
        videoRef.current.play().catch(console.error);
      }
    }
  }, [isPreview, sharedStream, selectedCameraId]);

  // Handle stream ready callback
  useEffect(() => {
    if (stream && onStreamReady && !isPreview) {
      onStreamReady(stream);
    }
  }, [stream, onStreamReady, isPreview]);

  // Real-time WebGL preview loop for distortion filters
  useEffect(() => {
    if (!needsWebGLPreview) {
      // Clean up any running loop
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const canvas = previewCanvasRef.current;
    if (!canvas || !videoRef.current) return;

    // Prepare reusable capture canvas
    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas");
    }
    const captureCanvas = captureCanvasRef.current;

    const render = async (time: number) => {
      if (!canvas || !videoRef.current) return;

      // Throttle to 30fps (~33ms)
      if (time - lastRenderTimeRef.current < 33) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastRenderTimeRef.current = time;

      try {
        const video = videoRef.current;

        const scale = 0.5; // render preview at 50% size for performance
        const targetW = Math.max(1, Math.floor(video.videoWidth * scale));
        const targetH = Math.max(1, Math.floor(video.videoHeight * scale));
        if (captureCanvas.width !== targetW || captureCanvas.height !== targetH) {
          captureCanvas.width = targetW;
          captureCanvas.height = targetH;
        }

        const ctxCap = captureCanvas.getContext("2d");
        if (!ctxCap) return;
        // Draw video frame into capture canvas (no flip; preview canvas CSS flips)
        ctxCap.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

        const uniforms = mapCssFilterStringToUniforms(filter);
        const glCanvas = await runFilter(captureCanvas, uniforms, fragSrc);

        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
          ctx2d.drawImage(glCanvas, 0, 0);
        }
      } catch (e) {
        console.error("Preview WebGL render failed:", e);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [needsWebGLPreview, filter]);

  // Listen for webcam-capture events
  useEffect(() => {
    const handleCapture = async () => {
      if (videoRef.current && stream) {
        const video = videoRef.current;

        // Use the video element directly as the source for WebGL
        // Set canvas dimensions to match video
        const captureCanvas = document.createElement("canvas");
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        const ctx = captureCanvas.getContext("2d");
        if (!ctx) return;

        // Apply the horizontal flip using Canvas 2D first
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, -captureCanvas.width, 0, captureCanvas.width, captureCanvas.height);

        let finalCanvas: HTMLCanvasElement = captureCanvas;

        // Apply filter using WebGL if a filter is selected
        if (filter !== "none") {
            try {
                const uniforms = mapCssFilterStringToUniforms(filter);
                // Use the canvas with the flip applied as the source for the GL filter
                finalCanvas = await runFilter(captureCanvas, uniforms, fragSrc);
            } catch (error) {
                console.error("WebGL filtering failed, falling back to no filter:", error);
                // If WebGL fails, use the canvas with just the flip
                 finalCanvas = captureCanvas;
            }
        }

        // Convert the final canvas (with flip and potentially WebGL filter) to JPEG data URL
        const photoDataUrl = finalCanvas.toDataURL("image/jpeg", 0.85);

        // Call the onPhoto callback
        onPhoto?.(photoDataUrl);

        // Dispatch a custom event with the photo data URL for other components to use
        const photoTakenEvent = new CustomEvent("photo-taken", {
          detail: photoDataUrl,
        });
        window.dispatchEvent(photoTakenEvent);

        // Clean up temporary canvas
        // No explicit cleanup needed for canvas elements, they are garbage collected
      }
    };

    if (!isPreview) {
      window.addEventListener("webcam-capture", handleCapture as EventListener);
      return () => window.removeEventListener("webcam-capture", handleCapture as EventListener);
    }
  }, [stream, onPhoto, isPreview, filter]);

  const startCamera = async () => {
    try {
      const constraints = {
        audio: false,
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError(err instanceof Error ? err.message : "Failed to access camera");
    }
  };

  const stopCamera = () => {
    if (stream && !isPreview) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {error ? (
        <div
          className="w-full h-full flex items-center justify-center"
          onClick={startCamera}
        >
          <CameraOff size={48} className="text-white/30 cursor-pointer" />
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ filter: needsWebGLPreview ? "none" : filter, transform: "scaleX(-1)" }}
          />
          {needsWebGLPreview && (
            <canvas
              ref={previewCanvasRef}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          )}
        </>
      )}
    </div>
  );
}
