import { useEffect, useRef, useState } from "react";
import { detectMarkers } from "./detectMarkers";
import { MAX_FRAME_GAP_MS } from "./physicalOrder";
import type { DetectedMarker } from "./types";

type CameraState = {
  status: "idle" | "starting" | "live" | "error";
  message: string;
};

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access was blocked. Allow camera access in your browser settings, then try again. You can also use the manual demo.";
  if (name === "NotFoundError")
    return "No camera was found. Connect a camera or use the manual demo.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The camera could not start. Close other apps using it and try again.";
  return "Camera scanning stopped. Try again, or use the manual demo.";
}

export function useCameraScanner(
  enabled: boolean,
  onFrame: (markers: DetectedMarker[], now: number) => void,
  attempt = 0,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle", message: "" });
      return;
    }
    let disposed = false;
    let stream: MediaStream | undefined;
    let animation = 0;
    let lastScan = -Infinity;
    let lastVideoTime = -1;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const release = () => {
      cancelAnimationFrame(animation);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
    const fail = (message: string) => {
      if (disposed) return;
      disposed = true;
      release();
      setState({ status: "error", message });
    };
    const scan = (now: number) => {
      if (disposed) return;
      if (
        video &&
        context &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.currentTime !== lastVideoTime &&
        now - lastScan >= 120
      ) {
        lastScan = now;
        lastVideoTime = video.currentTime;
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          onFrame(
            detectMarkers(
              context.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
            ),
            now,
          );
        } catch (error) {
          fail(cameraErrorMessage(error));
          return;
        }
      }
      if (Number.isFinite(lastScan) && now - lastScan > MAX_FRAME_GAP_MS) {
        onFrame([], now);
        lastScan = now;
      }
      animation = requestAnimationFrame(scan);
    };
    const onVisibility = () => {
      if (document.hidden)
        fail(
          "Camera paused while this page was hidden. Restart scanning when you return.",
        );
    };
    document.addEventListener("visibilitychange", onVisibility);
    setState({ status: "starting", message: "" });
    void (async () => {
      if (!window.isSecureContext) {
        fail(
          "Camera access requires HTTPS. Open a secure deployment, or use the manual demo.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail(
          "This browser cannot access a camera. Try a current mobile browser or use the manual demo.",
        );
        return;
      }
      if (!video || !context) {
        fail(
          "This browser cannot prepare the camera view. Use the manual demo.",
        );
        return;
      }
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (disposed) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;
        stream
          .getVideoTracks()
          .forEach((track) =>
            track.addEventListener(
              "ended",
              () =>
                fail("Camera disconnected. Reconnect it and restart scanning."),
              { once: true },
            ),
          );
        video.srcObject = stream;
        await video.play();
        if (disposed) return;
        setState({ status: "live", message: "" });
        animation = requestAnimationFrame(scan);
      } catch (error) {
        fail(cameraErrorMessage(error));
      }
    })();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [enabled, onFrame, attempt]);

  return { videoRef, ...state };
}
