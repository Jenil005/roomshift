import { useCallback, useEffect, useRef, useState } from "react";
import { AiScanSession, type AiFrame } from "./detect/AiScanSession";
import { loadCocoSsdDetector } from "./detect/cocoSsdDetector";
import {
  DetectorError,
  type DetectorErrorCode,
  type ObjectDetector,
} from "./detect/ObjectDetector";
import { SCAN_ERROR_MESSAGE } from "./useCameraScanner";

// If the model is not ready by then, QR Backup is offered (loading continues in the background).
export const MODEL_LOAD_TIMEOUT_MS = 15_000;

export type DetectorStatus = "idle" | "loading" | "slow" | "ready" | "failed";

export const DETECTOR_ERROR_MESSAGE: Record<DetectorErrorCode, string> = {
  unsupported:
    "This browser cannot run the AI scanner (WebGL is unavailable). Use QR Backup.",
  "model-failed":
    "The AI model could not be loaded. Check the connection, or use QR Backup.",
  timeout: "The AI model is taking too long to load. Use QR Backup.",
};

/**
 * Loads the on-device detector when `active` becomes true (AI Scanner selected). The model
 * is cached per page by the loader, so switching modes does not reinitialize it.
 */
export function useObjectDetector(
  active: boolean,
  load: () => Promise<ObjectDetector> = loadCocoSsdDetector,
  timeoutMs = MODEL_LOAD_TIMEOUT_MS,
) {
  const [state, setState] = useState<{
    status: DetectorStatus;
    detector?: ObjectDetector;
    error?: DetectorErrorCode;
  }>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!active) return;
    let current = true;
    setState((s) => (s.detector ? s : { status: "loading" }));
    const timer = window.setTimeout(() => {
      if (current)
        setState((s) => (s.status === "loading" ? { status: "slow" } : s));
    }, timeoutMs);
    loadRef
      .current()
      .then((detector) => {
        if (current) setState({ status: "ready", detector });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setState({
          status: "failed",
          error: error instanceof DetectorError ? error.code : "model-failed",
        });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [active, attempt, timeoutMs]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

type CameraState = {
  status: "idle" | "starting" | "live" | "error";
  message: string;
};

/** React wrapper around AiScanSession. One session per enable/attempt; needs a loaded detector. */
export function useAiScanner(
  enabled: boolean,
  detector: ObjectDetector | undefined,
  onFrame: (frame: AiFrame) => void,
  attempt = 0,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const [state, setState] = useState<CameraState>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    if (!enabled || !detector) {
      setState({ status: "idle", message: "" });
      return;
    }
    const video = videoRef.current;
    const session = new AiScanSession(detector);
    let active = true;
    const fail = (message: string) => {
      if (!active) return;
      active = false;
      session.stop();
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
    session.onFrame((frame) => {
      if (active) onFrameRef.current(frame);
    });
    setState({ status: "starting", message: "" });
    if (!video) {
      fail("This browser cannot prepare the camera view. Use QR Backup.");
      return;
    }
    void session.start(video).then(() => {
      if (active && session.live) setState({ status: "live", message: "" });
    });
    return () => {
      active = false;
      session.stop();
    };
  }, [enabled, detector, attempt]);

  return { videoRef, ...state };
}
