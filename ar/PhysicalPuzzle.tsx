import { AiScanner } from "./AiScanner";
import { ArrowUpRight } from "./components/ArrowUpRight";
import type { ObjectDetector } from "./detect/ObjectDetector";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MARKER_IDS,
  MARKER_LABEL,
  PHYSICAL_ORDER,
  type DetectedMarker,
  type MarkerId,
  type PhysicalPuzzleResult,
} from "./types";
import {
  PhysicalOrderTracker,
  toCameraResult,
  type OrderReading,
} from "./physicalOrder";
import { ScanSequence } from "./scan/ScanSequence";
import { useCameraScanner } from "./useCameraScanner";
import "./PhysicalPuzzle.css";

const EMPTY_READING: OrderReading = {
  status: "incomplete",
  order: [],
  progress: 0,
  heldForMs: 0,
};
const GUIDANCE = {
  incomplete:
    "Keep all three marker cards in view. Low light? Turn on a lamp or move closer.",
  duplicate: "Use one card per object. A duplicate marker is visible.",
  unaligned:
    "Place the cards side by side in a single row, with space between them.",
  "wrong-order": "All markers found. Revisit the clues and change their order.",
  unstable:
    "Movement detected. Hold the objects and camera steady to restart verification.",
  holding: "Correct arrangement. Hold the camera steady…",
  verified: "Physical arrangement verified.",
};

export type ScanMode = "ai" | "qr" | "manual";

/**
 * Emits local evidence; the caller decides how to submit it to the game server.
 * onResult: arrangement held in order (send as `physical`). onScanSequence: the order the
 * QR tags were scanned in (send as `scanned`). Neither is proof; the server decides.
 * Modes: AI Scanner (default; AI for book and cup, QR tag for keys), QR Backup, Manual.
 * onScanningChange(true) while a camera scan is live, so the host can pause heavy rendering
 * (for example RoomScene.stop()) during detection.
 */
export function PhysicalPuzzle({
  onResult,
  onScanSequence,
  onScanningChange,
  initialMode = "ai",
  loadDetector,
}: {
  onResult: (result: PhysicalPuzzleResult) => void;
  onScanSequence?: (scanned: MarkerId[]) => void;
  onScanningChange?: (scanning: boolean) => void;
  initialMode?: ScanMode;
  loadDetector?: () => Promise<ObjectDetector>;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [aiLive, setAiLive] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [markers, setMarkers] = useState<DetectedMarker[]>([]);
  const [reading, setReading] = useState(EMPTY_READING);
  const tracker = useRef(new PhysicalOrderTracker());
  const submitted = useRef(false);
  const sequence = useRef(new ScanSequence());
  const [scanned, setScanned] = useState<MarkerId[]>([]);
  const onScan = useCallback(
    (id: MarkerId) => {
      if (!sequence.current.append(id)) return;
      const list = sequence.current.current();
      setScanned(list);
      onScanSequence?.(list);
    },
    [onScanSequence],
  );
  const clearSequence = () => {
    sequence.current.clear();
    setScanned([]);
    onScanSequence?.([]);
  };
  const onFrame = useCallback(
    (detected: DetectedMarker[], now: number) => {
      if (submitted.current) return;
      const next = tracker.current.update(detected, now);
      setMarkers(detected);
      setReading(next);
      if (next.status === "verified") {
        submitted.current = true;
        setEnabled(false);
        onResult(toCameraResult(detected, next));
      }
    },
    [onResult],
  );
  const camera = useCameraScanner(enabled, onFrame, attempt, onScan);
  const scanning = mode === "ai" ? aiLive : camera.status === "live";
  useEffect(() => {
    onScanningChange?.(scanning);
  }, [scanning, onScanningChange]);
  useEffect(() => {
    if (camera.status === "error") {
      tracker.current.reset();
      setMarkers([]);
      setReading(EMPTY_READING);
    }
  }, [camera.status]);

  const clearScan = () => {
    tracker.current.reset();
    setMarkers([]);
    setReading(EMPTY_READING);
  };
  // The previous mode's scanner unmounts (or is disabled) first, which releases its camera.
  const switchMode = (next: ScanMode) => {
    setEnabled(false);
    clearScan();
    if (next !== "ai") setAiLive(false);
    setMode(next);
  };
  const start = () => {
    clearScan();
    clearSequence();
    setAttempt((value) => value + 1);
    setEnabled(true);
  };

  return (
    <section className="scanner-panel" aria-label="Physical puzzle scanner">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">VISION MODULE / 01</span>
          <h2>Read the room.</h2>
        </div>
        <span
          className={`status-tag ${scanning ? "live" : ""}`}
        >
          <span />
          {mode === "manual"
            ? "MANUAL DEMO"
            : mode === "ai"
              ? aiLive
                ? "AI LIVE"
                : "AI SCANNER"
              : camera.status === "live"
                ? "CAMERA LIVE"
                : "CAMERA OFF"}
        </span>
      </div>
      <div className="mode-switch" aria-label="Verification method">
        <button
          type="button"
          aria-pressed={mode === "ai"}
          onClick={() => switchMode("ai")}
        >
          AI scanner
        </button>
        <button
          type="button"
          aria-pressed={mode === "qr"}
          onClick={() => switchMode("qr")}
        >
          QR backup
        </button>
        <button
          type="button"
          aria-pressed={mode === "manual"}
          onClick={() => switchMode("manual")}
        >
          Manual demo
        </button>
      </div>
      {mode === "ai" ? (
        <AiScanner
          onResult={onResult}
          onSwitchToQr={() => switchMode("qr")}
          onLiveChange={setAiLive}
          loadDetector={loadDetector}
        />
      ) : mode === "qr" ? (
        <>
          <div
            className={`camera-stage ${camera.status === "live" ? "is-live" : ""}`}
          >
            <video
              ref={camera.videoRef}
              muted
              playsInline
              aria-label="Live rear camera feed"
            />
            {camera.status === "live" && (
              <svg
                className="marker-overlay"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {markers.map((marker, index) => (
                  <g key={`${marker.id}-${index}`}>
                    <polygon
                      points={marker.corners
                        .map((p) => `${p.x * 1000},${p.y * 1000}`)
                        .join(" ")}
                    />
                    <text
                      x={marker.center.x * 1000}
                      y={Math.max(
                        36,
                        Math.min(...marker.corners.map((p) => p.y)) * 1000 - 15,
                      )}
                      textAnchor="middle"
                    >
                      {MARKER_LABEL[marker.id]}
                    </text>
                  </g>
                ))}
              </svg>
            )}
            {camera.status !== "live" && (
              <div className="camera-placeholder">
                <div className="scan-symbol" aria-hidden="true">
                  ⌗
                </div>
                <h3>
                  {camera.status === "starting"
                    ? "Connecting to your camera"
                    : "Your room is the puzzle."}
                </h3>
                <p>
                  {camera.status === "starting"
                    ? "Allow camera access when your browser asks."
                    : "Place a marker on each object. Point your camera at all three to reveal their arrangement."}
                </p>
                {(camera.status === "idle" || camera.status === "error") && (
                  <button className="button primary" onClick={start}>
                    {camera.status === "error"
                      ? "Try camera again"
                      : "Enable camera"}{" "}
                    <span aria-hidden="true">
                      <ArrowUpRight />
                    </span>
                  </button>
                )}
              </div>
            )}
            {camera.status === "live" && (
              <div className="camera-caption">
                <span>KEEP ALL THREE CARDS IN FRAME</span>
                <span>REAR CAMERA</span>
              </div>
            )}
          </div>
          {camera.status === "error" && (
            <p role="alert" className="error-message">
              {camera.message}
            </p>
          )}
          <div className="scan-feedback">
            <div className="marker-list" aria-label="Detected objects">
              {MARKER_IDS.map((id, index) => (
                <span
                  key={id}
                  className={`marker-chip ${markers.some((marker) => marker.id === id) ? "detected" : ""}`}
                >
                  <small>0{index + 1}</small>
                  {MARKER_LABEL[id]}
                  <span
                    aria-label={
                      markers.some((marker) => marker.id === id)
                        ? "detected"
                        : "not detected"
                    }
                  >
                    {markers.some((marker) => marker.id === id) ? "●" : "○"}
                  </span>
                </span>
              ))}
            </div>
            <p className="guidance" role="status">
              {camera.status === "live"
                ? GUIDANCE[reading.status]
                : "Camera images are processed on your device."}
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
            {scanned.length > 0 && (
              <p className="scan-sequence" aria-label="Scan order">
                SCANNED: {scanned.map((id) => MARKER_LABEL[id]).join(" → ")}
                <button className="text-button" onClick={clearSequence}>
                  Clear scans
                </button>
              </p>
            )}
            {camera.status === "live" && camera.torch.supported && (
              <button
                className="text-button"
                aria-pressed={camera.torch.on}
                onClick={() => void camera.torch.toggle()}
              >
                {camera.torch.on ? "Torch off" : "Torch on"}
              </button>
            )}
            {(camera.status === "live" || camera.status === "starting") && (
              <button
                className="text-button"
                onClick={() => {
                  setEnabled(false);
                  clearScan();
                }}
              >
                Stop camera
              </button>
            )}
          </div>
        </>
      ) : (
        <ManualOrder onResult={onResult} />
      )}
    </section>
  );
}

function ManualOrder({
  onResult,
}: {
  onResult: (result: PhysicalPuzzleResult) => void;
}) {
  const [order, setOrder] = useState<string[]>(["", "", ""]);
  const [message, setMessage] = useState("");
  return (
    <form
      className="manual-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (new Set(order).size !== 3) {
          setMessage("Choose each object once.");
          return;
        }
        if (order.some((id, index) => id !== PHYSICAL_ORDER[index])) {
          setMessage(
            "That order does not match the clues. Try rearranging the objects.",
          );
          return;
        }
        onResult({
          solved: true,
          markers: [],
          detectedIds: [],
          order: order as MarkerId[],
          source: "manual",
          heldForMs: 0,
          evidence: { book: "manual", cup: "manual", keys: "manual" },
        });
      }}
    >
      <span className="eyebrow">CAMERA-FREE FALLBACK</span>
      <h3>Arrange. Then report.</h3>
      <p>
        Arrange the real objects using the clues, then enter their order from
        left to right. This is a manual demo; it does not verify the physical
        scene.
      </p>
      <div className="manual-slots">
        {["Left", "Middle", "Right"].map((position, index) => (
          <label key={position}>
            {position}
            <select
              required
              value={order[index]}
              onChange={(event) => {
                setOrder((current) =>
                  current.map((id, i) =>
                    i === index ? event.target.value : id,
                  ),
                );
                setMessage("");
              }}
            >
              <option value="">Select object</option>
              {MARKER_IDS.map((id) => (
                <option key={id} value={id}>
                  {MARKER_LABEL[id]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p role="status" className="manual-message">
        {message}
      </p>
      <button className="button primary" type="submit">
        Check arrangement <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
