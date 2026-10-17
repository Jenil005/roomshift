import { useCallback, useEffect, useRef, useState } from "react";
import { CameraScanSession, scanErrorCode } from "./scan/CameraScanSession";
import type { DetectedMarker, MarkerId, ScanErrorCode } from "./types";

type CameraState = {
  status: "idle" | "starting" | "live" | "error";
  message: string;
};

export const SCAN_ERROR_MESSAGE: Record<ScanErrorCode, string> = {
  denied:
    "Camera access was blocked. Allow camera access in your browser settings, then try again. You can also use the manual demo.",
  "no-camera":
    "No camera was found. Connect a camera or use the manual demo.",
  "insecure-context":
    "Camera access requires HTTPS. Open a secure deployment, or use the manual demo.",
  unknown:
    "The camera could not start. Close other apps using it and try again, or use the manual demo.",
};

export function cameraErrorMessage(error: unknown): string {
  return SCAN_ERROR_MESSAGE[scanErrorCode(error)];
}

/** React wrapper around CameraScanSession. One session per enable/attempt. */
export function useCameraScanner(
  enabled: boolean,
  onFrame: (markers: DetectedMarker[], now: number) => void,
  attempt = 0,
  onScan?: (id: MarkerId) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraScanSession | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [state, setState] = useState<CameraState>({
    status: "idle",
    message: "",
  });
  const [torch, setTorch] = useState({ supported: false, on: false });

  useEffect(() => {
    setTorch({ supported: false, on: false });
    if (!enabled) {
      setState({ status: "idle", message: "" });
      return;
    }
    const video = videoRef.current;
    const session = new CameraScanSession();
    sessionRef.current = session;
    let active = true;
    const fail = (message: string) => {
      if (!active) return;
      active = false;
      session.stop();
      setTorch({ supported: false, on: false });
      setState({ status: "error", message });
    };
    session.onError(({ code }) => fail(SCAN_ERROR_MESSAGE[code]));
    session.onEnded((reason) =>
      fail(
        reason === "hidden"
          ? "Camera paused while this page was hidden. Restart scanning when you return."
          : "Camera disconnected. Reconnect it and restart scanning.",
      ),
    );
    session.onMarkers(onFrame);
    session.onScan((id) => onScanRef.current?.(id));
    setState({ status: "starting", message: "" });
    if (!video) {
      fail("This browser cannot prepare the camera view. Use the manual demo.");
      return;
    }
    void session.start(video).then(() => {
      if (!active || !session.live) return;
      setState({ status: "live", message: "" });
      setTorch({ supported: session.torchSupported(), on: false });
    });
    return () => {
      active = false;
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [enabled, onFrame, attempt]);

  const toggleTorch = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !torch.on;
    if (await session.setTorch(next)) setTorch({ supported: true, on: next });
  }, [torch.on]);

  return { videoRef, ...state, torch: { ...torch, toggle: toggleTorch } };
}
