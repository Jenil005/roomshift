import { ArrowUpRight } from "./components/ArrowUpRight";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiFrame } from "./detect/AiScanSession";
import { coverTransform } from "./detect/geometry";
import { SightingTracker, type TrackedSighting } from "./detect/hybrid";
import { scanCandidates, type OtherSighting } from "./detect/objectClasses";
import type { ObjectDetector } from "./detect/ObjectDetector";
import { ScanProgress, useScanNotices } from "./ScanProgress";
import {
  alreadyScannedText,
  crowdedText,
  decideFrame,
} from "./scan/objectScan";
import {
  MARKER_IDS,
  MARKER_LABEL,
  type MarkerId,
  type ObjectScanReport,
  type Point,
  type ScanNotice,
} from "./types";
import {
  DETECTOR_ERROR_MESSAGE,
  useAiScanner,
  useObjectDetector,
} from "./useAiScanner";

// The same object is not reported again this soon, while the host records the first report.
const REPORT_DEBOUNCE_MS = 1_000;

/**
 * AI-first sequential scanning: point the camera at one object at a time. A single frame with
 * a confident detection (scanCandidates) marks that object scanned; it stays scanned when it
 * leaves the frame. `scanned` is the progress to show (the host owns it: the game server's
 * accepted scans plus this phone's queued ones). No hold, no QR tag and no three-object frame.
 * The camera stops once all objects are scanned.
 */
export function AiScanner({
  scanned,
  pending,
  onObjectScanned,
  notice: hostNotice,
  paused = false,
  onRestart,
  labels,
  onSwitchToQr,
  onLiveChange,
  loadDetector,
}: {
  scanned: readonly MarkerId[];
  pending?: readonly MarkerId[];
  onObjectScanned: (scan: ObjectScanReport) => void;
  notice?: ScanNotice | null;
  /** Nothing is recorded while paused (e.g. the breaker cooldown); the camera stays on. */
  paused?: boolean;
  onRestart?: () => void;
  /** Checklist names per object; defaults to the object names. */
  labels?: Record<MarkerId, string>;
  onSwitchToQr: () => void;
  onLiveChange?: (live: boolean) => void;
  loadDetector?: () => Promise<ObjectDetector>;
}) {
  const model = useObjectDetector(true, loadDetector);
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tracked, setTracked] = useState<TrackedSighting[]>([]);
  const [others, setOthers] = useState<OtherSighting[]>([]);
  const [inferenceMs, setInferenceMs] = useState(0);
  const sightings = useRef(new SightingTracker());
  const lastReport = useRef<{ id: MarkerId; at: number } | null>(null);
  const { notice, hint, justScanned } = useScanNotices(scanned, hostNotice);
  const complete = scanned.length >= MARKER_IDS.length;

  // Frames arrive from the camera loop; read the latest props through refs.
  const live = useRef({ scanned, paused, complete, onObjectScanned, hint });
  live.current = { scanned, paused, complete, onObjectScanned, hint };

  const clearView = () => {
    sightings.current.reset();
    setTracked([]);
    setOthers([]);
  };

  const onFrame = useCallback(
    (frame: AiFrame) => {
      setTracked(sightings.current.update(frame.sightings, frame.at));
      setOthers(frame.others);
      setInferenceMs(frame.inferenceMs);
      const now = live.current;
      if (now.paused || now.complete) return;
      // Only this frame's sightings count; remembered (stale) boxes are display only.
      const decision = decideFrame(
        scanCandidates(frame.sightings, model.detector?.scanThresholds),
        now.scanned,
      );
      if (decision.kind === "report") {
        const last = lastReport.current;
        if (last?.id === decision.scan.id && frame.at - last.at < REPORT_DEBOUNCE_MS) return;
        lastReport.current = { id: decision.scan.id, at: frame.at };
        now.onObjectScanned(decision.scan);
      } else if (decision.kind === "duplicate") {
        now.hint({ tone: "info", text: alreadyScannedText(decision.id) });
      } else if (decision.kind === "crowded") {
        now.hint({ tone: "info", text: crowdedText(decision.ids) });
      } else {
        now.hint(null);
      }
    },
    [model.detector],
  );
  const camera = useAiScanner(enabled, model.detector, onFrame, attempt);
  const cameraLive = camera.status === "live";

  useEffect(() => {
    onLiveChange?.(cameraLive);
  }, [cameraLive, onLiveChange]);
  useEffect(() => () => onLiveChange?.(false), [onLiveChange]);
  useEffect(() => {
    if (camera.status === "error") clearView();
  }, [camera.status]);
  // Every object is scanned: release the camera.
  useEffect(() => {
    if (complete) {
      setEnabled(false);
      clearView();
    }
  }, [complete]);

  const start = () => {
    clearView();
    lastReport.current = null;
    setAttempt((n) => n + 1);
    setEnabled(true);
  };
  const stop = () => {
    setEnabled(false);
    clearView();
  };

  const modelBusy = model.status === "loading" || model.status === "slow";

  // Recomputed on every render (each inference): the video size can change after rotation.
  const video = camera.videoRef.current;
  const toView = video
    ? coverTransform(
        video.videoWidth,
        video.videoHeight,
        video.clientWidth,
        video.clientHeight,
      )
    : (p: Point) => p;
  const pts = (corners: readonly Point[]) =>
    corners
      .map(toView)
      .map((p) => `${p.x * 1000},${p.y * 1000}`)
      .join(" ");
  const labelAt = (corners: readonly Point[]) => {
    const view = corners.map(toView);
    return {
      x: (Math.min(...view.map((p) => p.x)) + Math.max(...view.map((p) => p.x))) * 500,
      y: Math.max(36, Math.min(...view.map((p) => p.y)) * 1000 - 15),
    };
  };

  const idleText = complete
    ? "ALL OBJECTS SCANNED"
    : !cameraLive
      ? modelBusy
        ? "INITIALIZING AI"
        : model.status === "ready"
          ? "CAMERA READY"
          : model.status === "failed"
            ? "SWITCH TO QR BACKUP"
            : "AI SCANNER"
      : paused
        ? "BREAKER RESETTING"
        : others.length > 0 && tracked.every((t) => t.stale)
          ? "OBJECT NOT RECOGNIZED"
          : "POINT AT ONE OBJECT";

  return (
    <>
      <div className={`camera-stage ${cameraLive ? "is-live" : ""}`}>
        <video
          ref={camera.videoRef}
          muted
          playsInline
          autoPlay={false}
          aria-label="Live rear camera feed"
        />
        {cameraLive && (
          <svg
            className="marker-overlay ai-overlay"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {others.map((o, index) => (
              <g key={`other-${index}`} className="other">
                <polygon points={pts(o.corners)} />
                <text {...labelAt(o.corners)} textAnchor="middle">
                  {o.label} {Math.round(o.score * 100)}%
                </text>
              </g>
            ))}
            {tracked.map((t, index) => (
              <g
                key={`${t.id}-${t.evidence}-${index}`}
                className={`${t.evidence} ${t.stale ? "stale" : ""} ${scanned.includes(t.id) ? "scanned" : ""}`}
              >
                <polygon points={pts(t.corners)} />
                <text {...labelAt(t.corners)} textAnchor="middle">
                  {MARKER_LABEL[t.id]}{" "}
                  {scanned.includes(t.id)
                    ? "✓"
                    : t.evidence === "ai" && t.score !== undefined
                      ? `${Math.round(t.score * 100)}%`
                      : "QR"}
                </text>
              </g>
            ))}
          </svg>
        )}
        {!cameraLive && (
          <div className="camera-placeholder">
            {modelBusy ? (
              <div className="ai-loader" aria-hidden="true" />
            ) : (
              <div className="scan-symbol" aria-hidden="true">
                {complete ? "✓" : "◎"}
              </div>
            )}
            <h3>
              {complete
                ? "All three objects scanned."
                : modelBusy
                  ? "Initializing AI"
                  : model.status === "failed"
                    ? "AI scanner unavailable."
                    : camera.status === "starting"
                      ? "Connecting to your camera"
                      : "Scan one object at a time."}
            </h3>
            <p>
              {complete
                ? "The camera is off. The facility is checking the sequence."
                : model.status === "loading"
                  ? "Loading the object model onto this phone (7 to 18 MB, first time only)."
                  : model.status === "slow"
                    ? "The model is taking longer than expected. Keep waiting, or switch to QR Backup now."
                    : model.status === "failed"
                      ? DETECTOR_ERROR_MESSAGE[model.error ?? "model-failed"]
                      : camera.status === "starting"
                        ? "Allow camera access when your browser asks."
                        : "Point at a book, a cup or a keyboard. Each one stays scanned. No QR code required."}
            </p>
            {!complete &&
              model.status === "ready" &&
              (camera.status === "idle" || camera.status === "error") && (
                <button className="button primary" onClick={start}>
                  {camera.status === "error" ? "Restart AI camera" : "Start AI camera"}{" "}
                  <span aria-hidden="true">
                    <ArrowUpRight />
                  </span>
                </button>
              )}
            {!complete && (model.status === "slow" || model.status === "failed") && (
              <div className="ai-fallback-actions">
                <button className="button primary" onClick={onSwitchToQr}>
                  Switch to QR backup <span aria-hidden="true">→</span>
                </button>
                {model.status === "failed" && (
                  <button className="text-button" onClick={model.retry}>
                    Retry AI
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {cameraLive && (
          <div className="camera-caption">
            <span>AI · {model.detector?.name.startsWith("MediaPipe") ? "MEDIAPIPE" : "COCO-SSD"} · ON-DEVICE</span>
            <span>{inferenceMs > 0 ? `${Math.round(inferenceMs)} MS` : "REAR CAMERA"}</span>
          </div>
        )}
      </div>
      {camera.status === "error" && (
        <p role="alert" className="error-message">
          {camera.message}
        </p>
      )}
      <ScanProgress
        scanned={scanned}
        pending={pending}
        notice={notice}
        idleText={idleText}
        justScanned={justScanned}
        onRestart={onRestart}
        labels={labels}
      />
      <p className="guidance" role="status">
        {cameraLive
          ? "Move freely between objects. Scanned objects stay scanned."
          : "AI runs on this phone. Camera images are never uploaded or stored."}
      </p>
      {(cameraLive || camera.status === "starting") && (
        <button className="text-button" onClick={stop}>
          Stop camera
        </button>
      )}
    </>
  );
}
