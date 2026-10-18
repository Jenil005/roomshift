import { AiScanner } from "./AiScanner";
import { useCameraStage } from "./cameraLayout";
import { ArrowUpRight } from "./components/ArrowUpRight";
import type { ObjectDetector } from "./detect/ObjectDetector";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanProgress, useScanNotices } from "./ScanProgress";
import {
  alreadyScannedText,
  CHECKLIST_ORDER,
  crowdedText,
  decideFrame,
  LocalScanJudge,
  SCAN_COMPLETE_TEXT,
} from "./scan/objectScan";
import {
  MARKER_IDS,
  MARKER_LABEL,
  PHYSICAL_ORDER,
  type DetectedMarker,
  type EvidenceSource,
  type MarkerId,
  type ObjectScanReport,
  type PhysicalPuzzleResult,
  type ScanNotice,
} from "./types";
import { useCameraScanner } from "./useCameraScanner";
import "./PhysicalPuzzle.css";

export type ScanMode = "ai" | "qr" | "manual";

/**
 * Scan progress owned by a host (the game). `scanned` is what to show as scanned (accepted
 * by the server plus queued on this phone); `onObjectScanned` gets each newly recognized
 * object once; `notice` carries the server's verdicts.
 */
export type HostScans = {
  scanned: readonly MarkerId[];
  pending?: readonly MarkerId[];
  onObjectScanned: (scan: ObjectScanReport) => void;
  notice?: ScanNotice | null;
  paused?: boolean;
  onRestart?: () => void;
};

/**
 * Physical puzzle: scan the book, cup and keyboard one at a time, in the clues' sequence.
 * Modes: AI Scanner (default, no QR needed), QR Backup (printed tags, same one-at-a-time
 * rule), Manual report (camera-free, reported as unverified by camera).
 *
 * With `scans` the host owns progress and judging (the game server). Without it the
 * component judges locally for the standalone demo and calls onResult when the sequence is
 * complete. onResult also carries the manual report in both cases.
 * onScanningChange(true) while a camera scan is live, so the host can pause heavy rendering.
 * serverJudged: the game server checks manual reports. onModeChange lets a host remember the
 * mode the player chose.
 */
export function PhysicalPuzzle({
  onResult,
  scans,
  onScanningChange,
  onModeChange,
  initialMode = "ai",
  loadDetector,
  serverJudged = false,
}: {
  onResult: (result: PhysicalPuzzleResult) => void;
  scans?: HostScans;
  onScanningChange?: (scanning: boolean) => void;
  onModeChange?: (mode: ScanMode) => void;
  initialMode?: ScanMode;
  loadDetector?: () => Promise<ObjectDetector>;
  serverJudged?: boolean;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const manualLabel = serverJudged ? "Manual report" : "Manual demo";
  const [aiLive, setAiLive] = useState(false);
  const local = useLocalScans(onResult);
  const progress: HostScans = scans ?? local;

  const switchMode = (next: ScanMode) => {
    if (next !== "ai") setAiLive(false);
    setMode(next);
    onModeChange?.(next);
  };
  const [qrLive, setQrLive] = useState(false);
  const scanning = mode === "ai" ? aiLive : mode === "qr" && qrLive;
  useEffect(() => {
    onScanningChange?.(scanning);
  }, [scanning, onScanningChange]);

  return (
    <section className="scanner-panel" aria-label="Physical puzzle scanner">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">VISION MODULE / 01</span>
          <h2>Read the room.</h2>
        </div>
        <span className={`status-tag ${scanning ? "live" : ""}`}>
          <span />
          {mode === "manual"
            ? manualLabel.toUpperCase()
            : mode === "ai"
              ? aiLive
                ? "AI LIVE"
                : "AI SCANNER"
              : qrLive
                ? "CAMERA LIVE"
                : "CAMERA OFF"}
        </span>
      </div>
      <div className="mode-switch" aria-label="Verification method">
        <button type="button" aria-pressed={mode === "ai"} onClick={() => switchMode("ai")}>
          AI scanner
        </button>
        <button type="button" aria-pressed={mode === "qr"} onClick={() => switchMode("qr")}>
          QR backup
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => switchMode("manual")}>
          {manualLabel}
        </button>
      </div>
      {/* The previous mode's scanner unmounts first, which releases its camera. */}
      {mode === "ai" ? (
        <AiScanner
          {...progress}
          onSwitchToQr={() => switchMode("qr")}
          onLiveChange={setAiLive}
          loadDetector={loadDetector}
        />
      ) : mode === "qr" ? (
        <QrScanner {...progress} onLiveChange={setQrLive} />
      ) : (
        <ManualOrder onResult={onResult} serverJudged={serverJudged} />
      )}
    </section>
  );
}

/** Standalone demo: the same one-object-at-a-time sequence rule, judged on this device. */
function useLocalScans(onResult: (result: PhysicalPuzzleResult) => void): HostScans {
  const judge = useRef(new LocalScanJudge());
  const evidence = useRef<Partial<Record<MarkerId, EvidenceSource>>>({});
  const [scanned, setScanned] = useState<MarkerId[]>([]);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const onObjectScanned = useCallback(
    (scan: ObjectScanReport) => {
      const outcome = judge.current.record(scan.id);
      if (outcome === "duplicate") return;
      if (outcome === "wrong") {
        evidence.current = {};
        setScanned([]);
        setNotice({
          tone: "error",
          text: `${MARKER_LABEL[scan.id]} SCANNED OUT OF SEQUENCE — START AGAIN`,
        });
        return;
      }
      evidence.current[scan.id] = scan.evidence;
      const order = judge.current.current();
      setScanned(order);
      if (outcome === "accepted") {
        setNotice(null);
        return;
      }
      setNotice({ tone: "success", text: SCAN_COMPLETE_TEXT });
      onResult({
        solved: true,
        detectedIds: order,
        order,
        source: "camera",
        evidence: { ...evidence.current },
      });
    },
    [onResult],
  );
  const onRestart = useCallback(() => {
    judge.current.reset();
    evidence.current = {};
    setScanned([]);
    setNotice(null);
  }, []);
  return { scanned, onObjectScanned, notice, onRestart };
}

/** Printed QR tags, scanned one at a time with the same rules as the AI scanner. */
function QrScanner({
  scanned,
  pending,
  onObjectScanned,
  notice: hostNotice,
  paused = false,
  onRestart,
  onLiveChange,
}: HostScans & { onLiveChange: (live: boolean) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [markers, setMarkers] = useState<DetectedMarker[]>([]);
  const { notice, hint, justScanned } = useScanNotices(scanned, hostNotice, pending);
  const complete = scanned.length >= MARKER_IDS.length;
  const latest = useRef({ scanned, paused, complete, onObjectScanned, hint });
  latest.current = { scanned, paused, complete, onObjectScanned, hint };
  const lastReport = useRef<{ id: MarkerId; at: number } | null>(null);

  const onFrame = useCallback((detected: DetectedMarker[], now: number) => {
    setMarkers(detected);
    const props = latest.current;
    if (props.paused || props.complete) return;
    const candidates = [...new Set(detected.map((m) => m.id))].map(
      (id): ObjectScanReport => ({ id, evidence: "qr" }),
    );
    const decision = decideFrame(candidates, props.scanned);
    if (decision.kind === "report") {
      const last = lastReport.current;
      if (last?.id === decision.scan.id && now - last.at < 1_000) return;
      lastReport.current = { id: decision.scan.id, at: now };
      props.onObjectScanned(decision.scan);
    } else if (decision.kind === "duplicate") {
      props.hint({ tone: "info", text: alreadyScannedText(decision.id) });
    } else if (decision.kind === "crowded") {
      props.hint({ tone: "info", text: crowdedText(decision.ids) });
    } else {
      props.hint(null);
    }
  }, []);
  const camera = useCameraScanner(enabled, onFrame, attempt);
  const live = camera.status === "live";
  useEffect(() => {
    onLiveChange(live);
  }, [live, onLiveChange]);
  useEffect(() => () => onLiveChange(false), [onLiveChange]);
  useEffect(() => {
    if (camera.status === "error") setMarkers([]);
  }, [camera.status]);
  useEffect(() => {
    if (complete) {
      setEnabled(false);
      setMarkers([]);
    }
  }, [complete]);

  // object-fit: cover crops the frame; markers are mapped through the same cover transform.
  const { style: stageStyle, toView } = useCameraStage(camera.videoRef, live);

  const start = () => {
    setMarkers([]);
    lastReport.current = null;
    setAttempt((value) => value + 1);
    setEnabled(true);
  };

  return (
    <div className="scan-layout">
      <div className="scan-camera-col">
        <div className={`camera-stage ${live ? "is-live" : ""}`} style={stageStyle}>
          <video ref={camera.videoRef} muted playsInline aria-label="Live camera feed" />
          {live && (
            <svg className="marker-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              {markers.map((marker, index) => {
                const corners = marker.corners.map(toView);
                return (
                  <g key={`${marker.id}-${index}`} className={scanned.includes(marker.id) ? "scanned" : ""}>
                    <polygon points={corners.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")} />
                    <text
                      x={toView(marker.center).x * 1000}
                      y={Math.max(36, Math.min(...corners.map((p) => p.y)) * 1000 - 15)}
                      textAnchor="middle"
                    >
                      {MARKER_LABEL[marker.id]}
                      {scanned.includes(marker.id) ? " ✓" : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {!live && (
            <div className="camera-placeholder">
              <div className="scan-symbol" aria-hidden="true">
                {complete ? "✓" : "⌗"}
              </div>
              <h3>
                {complete
                  ? "All three objects scanned."
                  : camera.status === "starting"
                    ? "Connecting to your camera"
                    : "Scan one tag at a time."}
              </h3>
              <p>
                {complete
                  ? "The camera is off. The facility is checking the sequence."
                  : camera.status === "starting"
                    ? "Allow camera access when your browser asks."
                    : "Place a printed tag on each object, then point the camera at one tag at a time."}
              </p>
              {!complete && (camera.status === "idle" || camera.status === "error") && (
                <button className="button primary" onClick={start}>
                  {camera.status === "error" ? "Try camera again" : "Enable camera"}{" "}
                  <span aria-hidden="true">
                    <ArrowUpRight />
                  </span>
                </button>
              )}
            </div>
          )}
          {live && (
            <div className="camera-caption">
              <span>ONE TAG AT A TIME</span>
              <span>CAMERA</span>
            </div>
          )}
        </div>
        {camera.status === "error" && (
          <p role="alert" className="error-message">
            {camera.message}
          </p>
        )}
      </div>
      <div className="scan-side">
        <ScanProgress
          scanned={scanned}
          pending={pending}
          notice={notice}
          idleText={complete ? "ALL OBJECTS SCANNED" : live ? (paused ? "BREAKER RESETTING" : "POINT AT ONE TAG") : "QR BACKUP"}
          justScanned={justScanned}
          onRestart={onRestart}
        />
        <p className="guidance" role="status">
          {live ? "Scanned objects stay scanned. Low light? Turn on a lamp or move closer." : "Camera images are processed on your device."}
        </p>
        {live && camera.torch.supported && (
          <button className="text-button" aria-pressed={camera.torch.on} onClick={() => void camera.torch.toggle()}>
            {camera.torch.on ? "Torch off" : "Torch on"}
          </button>
        )}
        {(live || camera.status === "starting") && (
          <button className="text-button" onClick={() => setEnabled(false)}>
            Stop camera
          </button>
        )}
      </div>
    </div>
  );
}

function ManualOrder({
  onResult,
  serverJudged,
}: {
  onResult: (result: PhysicalPuzzleResult) => void;
  serverJudged: boolean;
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
        if (!serverJudged && order.some((id, index) => id !== PHYSICAL_ORDER[index])) {
          setMessage("That sequence does not match the clues. Compare clues and try again.");
          return;
        }
        setMessage(serverJudged ? "Report sent. Waiting for the facility to check it…" : "");
        onResult({
          // With a server, `solved` is only the client's guess and is ignored there.
          solved: !serverJudged,
          detectedIds: [],
          order: order as MarkerId[],
          source: "manual",
          evidence: { book: "manual", cup: "manual", keyboard: "manual" },
        });
      }}
    >
      <span className="eyebrow">CAMERA-FREE FALLBACK</span>
      <h3>Decide the sequence. Then report.</h3>
      <p>
        Use the clues to choose the scan sequence, first to last.{" "}
        {serverJudged
          ? "This is a manual report, recorded as unverified by camera."
          : "This is a manual demo; it does not verify the physical scene."}
      </p>
      <div className="manual-slots">
        {["First", "Second", "Third"].map((position, index) => (
          <label key={position}>
            {position}
            <select
              required
              value={order[index]}
              onChange={(event) => {
                setOrder((current) => current.map((id, i) => (i === index ? event.target.value : id)));
                setMessage("");
              }}
            >
              <option value="">Select object</option>
              {CHECKLIST_ORDER.map((id) => (
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
        Report sequence <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
