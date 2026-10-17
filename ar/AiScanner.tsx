import { ArrowUpRight } from "./components/ArrowUpRight";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiFrame } from "./detect/AiScanSession";
import { coverTransform } from "./detect/geometry";
import {
  adaptiveFrameGap,
  FrameIntervalMeter,
  hybridEvidenceAccepted,
  SightingTracker,
  type TrackedSighting,
} from "./detect/hybrid";
import { aiDetectableIds, type OtherSighting } from "./detect/objectClasses";
import type { ObjectDetector } from "./detect/ObjectDetector";
import {
  PhysicalOrderTracker,
  toCameraResult,
  type OrderReading,
  type OrderStatus,
  type TrackerOptions,
} from "./physicalOrder";
import {
  MARKER_IDS,
  MARKER_LABEL,
  type MarkerId,
  type PhysicalPuzzleResult,
  type Point,
} from "./types";
import {
  DETECTOR_ERROR_MESSAGE,
  useAiScanner,
  useObjectDetector,
} from "./useAiScanner";

// AI boxes arrive at most ~4 times a second and jitter more than QR corners. The 1.2 s hold
// is the same; a hold needs at least 3 fresh frames. The allowed gap between frames adapts
// to the device's inference speed (adaptiveFrameGap: 1 s to 2.5 s).
export const AI_TRACKER_OPTIONS: Partial<TrackerOptions> = {
  maxFrameGapMs: 1000,
  maxCenterDrift: 0.06,
  maxRowSpread: 0.3,
  minHoldFrames: 3,
};

const EMPTY_READING: OrderReading = {
  status: "incomplete",
  order: [],
  progress: 0,
  heldForMs: 0,
};

const HEADLINE: Record<OrderStatus, string> = {
  incomplete: "SCANNING OBJECTS",
  duplicate: "DUPLICATE OBJECT",
  unaligned: "LINE THEM UP",
  "wrong-order": "WRONG ORDER",
  unstable: "HOLD STEADY",
  holding: "HOLD STEADY",
  verified: "ARRANGEMENT VERIFIED",
};

const GUIDANCE: Record<OrderStatus, string> = {
  incomplete:
    "Point the camera at the book and the cup, and keep the KEYS QR tag in view.",
  duplicate:
    "More than one of the same object is visible. Keep only one in frame.",
  unaligned:
    "Place the objects side by side in one row, with space between them.",
  "wrong-order": "All objects found. Revisit the clues and change their order.",
  unstable: "Movement detected. Hold the objects and camera steady.",
  holding: "Correct arrangement. Hold the camera steady…",
  verified: "Physical arrangement verified.",
};

/**
 * AI-first physical puzzle scanning: COCO-SSD finds BOOK and CUP; objects the model cannot
 * see (KEYS) are taken from their QR tag in the same frame. Emits local evidence only; it
 * never reports a result from AI sightings alone.
 */
export function AiScanner({
  onResult,
  onSwitchToQr,
  onLiveChange,
  loadDetector,
}: {
  onResult: (result: PhysicalPuzzleResult) => void;
  onSwitchToQr: () => void;
  onLiveChange?: (live: boolean) => void;
  loadDetector?: () => Promise<ObjectDetector>;
}) {
  const model = useObjectDetector(true, loadDetector);
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tracked, setTracked] = useState<TrackedSighting[]>([]);
  const [others, setOthers] = useState<OtherSighting[]>([]);
  const [reading, setReading] = useState(EMPTY_READING);
  const [inferenceMs, setInferenceMs] = useState(0);
  const order = useRef(new PhysicalOrderTracker(AI_TRACKER_OPTIONS));
  const sightings = useRef(new SightingTracker());
  const intervals = useRef(new FrameIntervalMeter());
  const submitted = useRef(false);

  const clearScan = () => {
    order.current.reset();
    sightings.current.reset();
    intervals.current.reset();
    setTracked([]);
    setOthers([]);
    setReading(EMPTY_READING);
  };

  const onFrame = useCallback(
    (frame: AiFrame) => {
      if (submitted.current) return;
      // The gap allowed before this frame comes from earlier frames only.
      order.current.configure({
        maxFrameGapMs: adaptiveFrameGap(intervals.current.interval),
      });
      intervals.current.sample(frame.at);
      // Only the current frame's sightings count as evidence; remembered ones are display only.
      const next = order.current.update(frame.sightings, frame.at);
      setTracked(sightings.current.update(frame.sightings, frame.at));
      setOthers(frame.others);
      setInferenceMs(frame.inferenceMs);
      setReading(next);
      if (next.status === "verified" && hybridEvidenceAccepted(frame.sightings)) {
        submitted.current = true;
        setEnabled(false);
        onResult(toCameraResult(frame.sightings, next));
      }
    },
    [onResult],
  );
  const camera = useAiScanner(enabled, model.detector, onFrame, attempt);
  const live = camera.status === "live";

  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);
  useEffect(() => () => onLiveChange?.(false), [onLiveChange]);
  useEffect(() => {
    if (camera.status === "error") clearScan();
  }, [camera.status]);

  const start = () => {
    clearScan();
    setAttempt((n) => n + 1);
    setEnabled(true);
  };
  const stop = () => {
    setEnabled(false);
    clearScan();
  };

  const aiIds = model.detector ? aiDetectableIds(model.detector.classMap) : [];
  const fresh = tracked.filter((t) => !t.stale);
  const seen = (id: MarkerId) => tracked.find((t) => t.id === id);
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

  const headline = !live
    ? modelBusy
      ? "INITIALIZING AI"
      : model.status === "ready"
        ? "CAMERA READY"
        : model.status === "failed"
          ? "SWITCH TO QR BACKUP"
          : "AI SCANNER"
    : reading.status !== "incomplete"
      ? HEADLINE[reading.status]
      : fresh.length > 0
        ? `${[...new Set(fresh.map((t) => MARKER_LABEL[t.id]))].join(" + ")} DETECTED`
        : others.length > 0
          ? "OBJECT NOT RECOGNIZED"
          : HEADLINE.incomplete;

  return (
    <>
      <div className={`camera-stage ${live ? "is-live" : ""}`}>
        <video
          ref={camera.videoRef}
          muted
          playsInline
          autoPlay={false}
          aria-label="Live rear camera feed"
        />
        {live && (
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
                className={`${t.evidence} ${t.stale ? "stale" : ""}`}
              >
                <polygon points={pts(t.corners)} />
                <text {...labelAt(t.corners)} textAnchor="middle">
                  {MARKER_LABEL[t.id]}{" "}
                  {t.evidence === "ai" && t.score !== undefined
                    ? `${Math.round(t.score * 100)}%`
                    : "QR"}
                </text>
              </g>
            ))}
          </svg>
        )}
        {!live && (
          <div className="camera-placeholder">
            {modelBusy ? (
              <div className="ai-loader" aria-hidden="true" />
            ) : (
              <div className="scan-symbol" aria-hidden="true">
                ◎
              </div>
            )}
            <h3>
              {modelBusy
                ? "Initializing AI"
                : model.status === "failed"
                  ? "AI scanner unavailable."
                  : camera.status === "starting"
                    ? "Connecting to your camera"
                    : "Your room is the puzzle."}
            </h3>
            <p>
              {model.status === "loading"
                ? "Loading the object model onto this phone (7 to 18 MB, first time only)."
                : model.status === "slow"
                  ? "The model is taking longer than expected. Keep waiting, or switch to QR Backup now."
                  : model.status === "failed"
                    ? DETECTOR_ERROR_MESSAGE[model.error ?? "model-failed"]
                    : camera.status === "starting"
                      ? "Allow camera access when your browser asks."
                      : "AI finds the book and the cup. Keep the KEYS QR tag visible too."}
            </p>
            {model.status === "ready" &&
              (camera.status === "idle" || camera.status === "error") && (
                <button className="button primary" onClick={start}>
                  {camera.status === "error" ? "Restart AI camera" : "Start AI camera"}{" "}
                  <span aria-hidden="true">
                    <ArrowUpRight />
                  </span>
                </button>
              )}
            {(model.status === "slow" || model.status === "failed") && (
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
        {live && (
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
      <div className="scan-feedback">
        <p className="ai-headline" aria-live="polite">
          {headline}
        </p>
        <div className="marker-list" aria-label="Detected objects">
          {MARKER_IDS.map((id, index) => {
            const s = seen(id);
            const needsQr = !aiIds.includes(id);
            const state = s
              ? s.evidence === "ai"
                ? `AI ${Math.round((s.score ?? 0) * 100)}%`
                : "QR"
              : needsQr
                ? "NEEDS QR TAG"
                : "MISSING";
            return (
              <span
                key={id}
                className={`marker-chip ${s ? "detected" : ""} ${needsQr && !s ? "needs-qr" : ""}`}
                aria-label={`${MARKER_LABEL[id]}: ${s ? `detected by ${s.evidence === "ai" ? "AI" : "QR tag"}` : needsQr ? "needs QR tag" : "not detected"}`}
              >
                <small>0{index + 1}</small>
                {MARKER_LABEL[id]}
                <em>{state}</em>
              </span>
            );
          })}
        </div>
        <p className="guidance" role="status">
          {live
            ? GUIDANCE[reading.status]
            : "AI runs on this phone. Camera images are never uploaded or stored."}
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Arrangement stability"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(reading.progress * 100)}
        >
          <div style={{ width: `${reading.progress * 100}%` }} />
        </div>
        {(live || camera.status === "starting") && (
          <button className="text-button" onClick={stop}>
            Stop camera
          </button>
        )}
      </div>
    </>
  );
}
