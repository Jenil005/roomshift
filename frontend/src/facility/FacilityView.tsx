import { useEffect, useMemo, useRef, useState } from "react";
import { MODULE_LABEL, type ModuleId } from "@shared/puzzles/commsBoot";
import type { Room } from "@shared/types";
import { facilityStateFrom } from "./state";
import { useArScan } from "./useArScan";
import { FacilitySession, type FacilityStatus } from "../../../ar/facility/session";
import type { FacilityQuality, Hotspot } from "../../../ar/facility/scene";
import { MARKER_IDS } from "../../../ar/types";
import { CHECKLIST_ORDER, CLUE_LABEL, SEQUENCE_HINT_TEXT } from "../../../ar/scan/objectScan";
import { SCAN_ITEM_MARK, SCAN_ITEM_SPOKEN, SCAN_ITEM_TEXT, scanItemState } from "../../../ar/ScanProgress";
import { usePuzzle1Scans } from "../game/usePuzzle1Scans";
import { useGame } from "../game/useGame";
import { useBootDraft } from "../ui/useBootDraft";
import { useFinalHold } from "../ui/useFinalHold";

const ENGINE_URL = `${import.meta.env.BASE_URL}external/xr/xr.js`;
const QUALITY_KEY = "roomshift.fx";
const HEIGHT_KEY = "roomshift.cameraHeight";

const PHASE_TASK: Partial<Record<Room["phase"], string>> = {
  INTRO: "Briefing in progress. Explore the facility while you wait.",
  PUZZLE_1: `${SEQUENCE_HINT_TEXT} In AR, tap SCAN IN AR and point at one object.`,
  PUZZLE_1_COMPLETE: "Breaker engaged. Emergency power flowing.",
  PUZZLE_2: "Comms terminal: tap its panels to build the shared boot order.",
  PUZZLE_2_COMPLETE: "Comms online. The blast door controller is waking.",
  FINAL_SEQUENCE: "Everyone hold ACTIVATE together to open the exit.",
  COMPLETE: "Exit open. Power restored.",
};

function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // per-viewer convenience only
  }
}

/**
 * Life-size facility. Mounted INSTEAD of the mission screens, so while it is open nothing
 * else can hold the camera; closing it stops XR8 and releases the camera first.
 */
export default function FacilityView({ onClose, onScan }: { onClose: () => void; onScan?: () => void }) {
  const { room, clue } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<FacilitySession | null>(null);
  const [status, setStatus] = useState<FacilityStatus | null>(null);
  const [quality, setQuality] = useState<FacilityQuality>(() => (readStored(QUALITY_KEY) === "low" ? "low" : "high"));
  const [height, setHeight] = useState(() => readStored(HEIGHT_KEY) ?? "1.40");
  const [heightError, setHeightError] = useState(false);
  const { toggle } = useBootDraft();
  const { holding, handlers } = useFinalHold();
  const p1 = usePuzzle1Scans();
  const lastSeq = useRef<number | null>(null);
  // Object scanning on the AR camera feed, without leaving AR (FacilitySession.tapFrames).
  const [arScan, setArScan] = useState(false);
  const ar = status?.ar ?? false;
  const scan = useArScan(session, arScan && room?.phase === "PUZZLE_1", ar, p1.host);
  const debugThumb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = debugThumb.current;
    if (!box || !scan.debugCanvas) return;
    box.appendChild(scan.debugCanvas);
    return () => scan.debugCanvas?.remove();
  }, [scan.debugCanvas]);

  useEffect(() => {
    const s = new FacilitySession(host.current!, { engineUrl: ENGINE_URL, quality });
    const offStatus = s.onStatus(setStatus);
    setSession(s);
    // Debug hook (dev builds or ?debug): the 3D session only, never tokens or camera images.
    const debug = import.meta.env.DEV || new URLSearchParams(location.search).has("debug");
    if (debug) (window as unknown as { __roomshiftFacility?: FacilitySession }).__roomshiftFacility = s;
    return () => {
      if (debug) delete (window as unknown as { __roomshiftFacility?: FacilitySession }).__roomshiftFacility;
      offStatus();
      s.dispose(); // stops XR8 and releases the camera
      setSession(null);
    };
  }, [quality]);

  // Server state drives the scene.
  const state = useMemo(() => (room ? facilityStateFrom(room) : null), [room]);
  useEffect(() => {
    if (session && state) session.apply(state);
  }, [session, state]);

  // One-off effects for NEW server events only (seq is strictly increasing): a reload or a
  // reopened view never replays old failures.
  useEffect(() => {
    if (!session || !room) return;
    const newest = room.events.at(-1)?.seq ?? 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    for (const e of room.events) {
      if (e.seq <= lastSeq.current) continue;
      if (e.type === "puzzle:failed") session.flash(e.puzzle === 2 ? "terminal" : "breaker");
    }
    lastSeq.current = newest;
  }, [session, room]);

  // 3D taps become requests; the server decides what happens.
  const phase = room?.phase;
  const canScanInAr = ar && scan.supported;
  useEffect(() => {
    if (!session) return;
    return session.onHotspot((h: Hotspot) => {
      if (h.kind === "module" && phase === "PUZZLE_2" && h.id) void toggle(h.id as ModuleId);
      if (h.kind === "station" && phase === "PUZZLE_1") {
        // In AR a pedestal starts scanning right here; otherwise it opens the full scanner.
        if (canScanInAr) setArScan(true);
        else if (onScan) {
          session.stopAR();
          onScan();
        }
      }
    });
  }, [session, phase, toggle, onScan, canScanInAr]);

  if (!room) return null;
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has("debug");
  const calibrate = () => {
    const value = Number(height);
    const ok = session?.calibrate(value) ?? false;
    setHeightError(!ok);
    if (ok) store(HEIGHT_KEY, String(value));
  };
  const close = () => {
    session?.stopAR();
    onClose();
  };
  const toScanner = () => {
    session?.stopAR();
    onScan?.();
  };
  const draft = room.puzzle2?.draft ?? [];

  return (
    <div className="facility-root" data-ar={ar ? "on" : "off"}>
      <div ref={host} className="facility-viewport" aria-label={ar ? "World-tracked AR facility" : "3D preview of the facility, not AR"} />
      <div className="facility-hud">
        <header className="facility-top">
          <div>
            <div className="font-display text-[15px] text-manual">FACILITY 04</div>
            <div className="text-[12px] text-label">{PHASE_TASK[room.phase] ?? "Lobby"}</div>
          </div>
          <span className={`facility-chip ${ar ? "is-ar" : ""}`} role="status">{ar ? "AR · WORLD TRACKING" : "3D PREVIEW · NOT AR"}</span>
        </header>

        <ul className="facility-systems" aria-label="Facility systems (from the server)">
          <li className={room.systems.breaker ? "on" : ""}>BREAKER {room.systems.breaker ? "ONLINE" : "OFFLINE"}</li>
          <li className={room.systems.terminal ? "on" : ""}>COMMS {room.systems.terminal ? "ONLINE" : "OFFLINE"}</li>
          <li className={room.systems.door ? "on" : ""}>EXIT {room.systems.door ? "OPEN" : "SEALED"}</li>
        </ul>

        <div className="flex-1" />

        {scan.live && <div className="facility-scan-reticle" aria-hidden="true" />}

        {(room.phase === "PUZZLE_1" || room.phase === "PUZZLE_1_COMPLETE") && (
          <section className="facility-card" aria-label="Object scan progress">
            <div className="text-label">Object scans (shared with your team)</div>
            {/* Clue words in a fixed, non-solution order; green only once the server accepted. */}
            <ul className="facility-scans" aria-label="Scan checklist">
              {CHECKLIST_ORDER.map((id) => {
                const state = scanItemState(id, p1.scanned, p1.host.pending);
                return (
                  <li key={id} data-state={state} className={`${state === "accepted" ? "on" : state === "pending" ? "is-pending" : ""} ${scan.justScanned === id ? "just-scanned" : ""}`} aria-label={`${CLUE_LABEL[id]}: ${SCAN_ITEM_SPOKEN[state]}`}>
                    {SCAN_ITEM_MARK[state]} {CLUE_LABEL[id]} {SCAN_ITEM_TEXT[state]}
                  </li>
                );
              })}
            </ul>
            <div className={p1.solved ? "mt-1 text-phosphor" : "mt-1"}>
              {p1.solved ? "BREAKER RESTORED — PUZZLE COMPLETE" : `PROGRESS ${p1.accepted.length}/${MARKER_IDS.length}`}
            </div>
            {arScan && room.phase === "PUZZLE_1" ? (
              <>
                <p className={`m-0 facility-scan-notice is-${scan.notice?.tone ?? "idle"}`} aria-live="polite">
                  {scan.notice?.text ??
                    (!ar
                      ? "Start AR to scan here, or use SCAN OBJECTS."
                      : scan.model === "loading" || scan.model === "slow"
                        ? "Loading the object model (first time only)…"
                        : scan.model === "failed"
                          ? "The AI model could not load. Use SCAN OBJECTS for QR backup or a manual report."
                          : p1.host.paused
                            ? "Breaker resetting…"
                            : "Point the phone at ONE object.")}
                </p>
                {scan.live && <div className="text-[12px] text-label">SEEING: {scan.seeing.length ? scan.seeing.join(" · ") : "nothing yet"}</div>}
                {scan.model === "failed" && <button type="button" onClick={scan.retryModel}>RETRY AI</button>}
              </>
            ) : (
              p1.host.notice?.tone === "error" && <p className="m-0 text-emergency" role="alert">{p1.host.notice.text}</p>
            )}
            {room.phase === "PUZZLE_1" && p1.scanned.length > 0 && p1.host.onRestart && (
              <button type="button" className="facility-text-button" onClick={p1.host.onRestart}>RESTART SCANNING</button>
            )}
            {debug && <div ref={debugThumb} className="facility-scan-debug" aria-hidden="true" />}
          </section>
        )}

        {room.phase === "PUZZLE_2" && (
          <section className="facility-card" aria-label="Comms terminal">
            <div className="text-label">Your notes (only on this phone)</div>
            {clue?.clues.map((c) => <p key={c} className="m-0 text-[14px]">{c}</p>)}
            <div className="mt-1 text-phosphor">
              ORDER: {draft.length ? draft.map((m) => MODULE_LABEL[m as ModuleId] ?? m).join(" → ") : "empty"} · tap the terminal panels
            </div>
          </section>
        )}

        {status && (
          <p className="facility-message" role="status" aria-live="polite">
            {status.message}
            {status.engine === "loading" && !ar && " Downloading the AR engine (about 6.5 MB, first time only)…"}
          </p>
        )}

        <div className="facility-controls">
          {status?.canCalibrate && (
            <span className="facility-calibrate">
              <label>
                Camera height (m)
                <input type="number" inputMode="decimal" min={0.3} max={2.5} step={0.01} value={height} onChange={(e) => setHeight(e.target.value)} aria-invalid={heightError} />
              </label>
              <button type="button" onClick={calibrate}>CALIBRATE FLOOR</button>
            </span>
          )}
          {status?.canPlace && <button type="button" className="primary" onClick={() => session?.place()}>PLACE FACILITY</button>}
          {status?.canMove && <button type="button" onClick={() => session?.move()}>MOVE</button>}
          {!ar && status?.canStartAr && (
            // startAR must run inside this tap: iOS only prompts for motion access in a gesture.
            <button type="button" className="primary" onClick={() => session?.startAR()}>START AR</button>
          )}
          {!ar && status?.needsReload && <button type="button" onClick={() => location.reload()}>RELOAD TO RESTART AR</button>}
          {ar && <button type="button" onClick={() => session?.stopAR()}>EXIT AR</button>}
          {!ar && (
            <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; store(QUALITY_KEY, q); setQuality(q); }}>
              FX {quality === "high" ? "HIGH" : "LOW"}
            </button>
          )}
        </div>

        <div className="facility-controls">
          {room.phase === "PUZZLE_1" && canScanInAr && (
            <button type="button" className="primary" aria-pressed={arScan} onClick={() => setArScan((v) => !v)}>
              {arScan ? "STOP SCANNING" : `SCAN IN AR ${p1.scanned.length}/${MARKER_IDS.length}`}
            </button>
          )}
          {room.phase === "PUZZLE_1" && onScan && (
            <button type="button" className={canScanInAr ? "" : "primary"} onClick={toScanner}>
              {canScanInAr ? "FULL SCANNER (ends AR)" : `SCAN OBJECTS ${p1.scanned.length}/${MARKER_IDS.length}`}
            </button>
          )}
          {room.phase === "FINAL_SEQUENCE" && (
            <button type="button" {...handlers} aria-pressed={holding} className={`facility-hold ${holding ? "is-holding" : ""}`}>
              {holding ? "HOLDING…" : "HOLD TO ACTIVATE"}
            </button>
          )}
          <button type="button" onClick={close}>BACK TO MISSION</button>
        </div>
        <p className="facility-legal">
          XR Engine by Niantic Spatial, Inc. ©2026. <a href={`${import.meta.env.BASE_URL}external/xr/LICENSE`} target="_blank" rel="noopener">License</a> · <a href={`${import.meta.env.BASE_URL}licenses.html`} target="_blank" rel="noopener">Credits</a> · Floor height is a manual estimate. Watch real obstacles.
        </p>
      </div>
    </div>
  );
}
