import { useEffect, useState } from "react";
import { DEBUG_EVENT, type DebugReport } from "../../../ar/debugChannel";
import { API_ORIGIN } from "../game/config";
import { useGame } from "../game/useGame";

declare const __BUILD_SHA__: string;
declare const __RUNTIMES__: string;

const enabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");

/** Latest camera/detector/tracking values reported by the AR module (only collected with ?debug). */
function useDebugReports() {
  const [report, setReport] = useState<DebugReport>({});
  useEffect(() => {
    if (!enabled) return;
    let pending: DebugReport = {};
    let timer = 0;
    // Frames report several times a second; repaint the overlay at most twice a second.
    const onReport = (e: Event) => {
      pending = { ...pending, ...(e as CustomEvent<DebugReport>).detail };
      if (!timer) timer = window.setTimeout(() => {
        timer = 0;
        const next = pending;
        setReport((r) => ({ ...r, ...next }));
        pending = {};
      }, 500);
    };
    window.addEventListener(DEBUG_EVENT, onReport);
    return () => {
      window.removeEventListener(DEBUG_EVENT, onReport);
      clearTimeout(timer);
    };
  }, []);
  return report;
}

/**
 * Tester overlay, only with ?debug. Shows build and runtime versions, mode, connection, room
 * version, phase, camera owner, detector and inference time, AR tracking and frame time, and the
 * latest error. Never shows player tokens, clues or camera images.
 */
export function DebugOverlay() {
  const { mode, connection, room, lastError, serverTimeOffset, selfId } = useGame();
  const ar = useDebugReports();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const last = room?.events.at(-1);
  const lines = [
    `build ${__BUILD_SHA__} · ${mode === "mock" ? "LOCAL DEMO (in-tab engine)" : `live · ${API_ORIGIN.replace(/^https?:\/\//, "")}`}`,
    __RUNTIMES__,
    `net ${connection} · offset ${Math.round(serverTimeOffset)} ms`,
    room ? `room ${room.code} v${room.version} · ${room.phase} · ${room.players.filter((p) => p.connected).length}/${room.players.length} online` : "no room",
    room ? `systems ${Object.entries(room.systems).filter(([, on]) => on).map(([k]) => k).join(",") || "none"}` : "",
    last ? `event #${last.seq} ${last.type}` : "",
    selfId ? `me ${selfId.slice(0, 6)}…` : "",
    `camera ${ar.camera ?? "not opened"}`,
    ar.detector ? `detector ${ar.detector}${ar.inferenceMs !== undefined ? ` · ${Math.round(ar.inferenceMs)} ms/frame` : ""}` : "",
    ar.tracking ? `tracking ${ar.tracking}${ar.frameMs !== undefined ? ` · ${Math.round(ar.frameMs)} ms frame` : ""}` : "",
    lastError ? `error ${lastError.code} (${lastError.action})` : "",
    ar.error ? `camera error ${ar.error}` : "",
  ].filter(Boolean);
  return (
    <aside className="debug-overlay" aria-label="Debug information">
      <button type="button" onClick={() => setOpen((o) => !o)}>{open ? "DEBUG ▾" : "DEBUG ▸"}</button>
      {open && <pre>{lines.join("\n")}</pre>}
    </aside>
  );
}
