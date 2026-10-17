import { useState } from "react";
import { API_ORIGIN } from "../game/config";
import { useGame } from "../game/useGame";

declare const __BUILD_SHA__: string;

const enabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");

/**
 * Tester overlay, only with ?debug. Shows build, mode, connection, room version, phase,
 * latest server event and error code. Never shows player tokens, clues or camera images.
 */
export function DebugOverlay() {
  const { mode, connection, room, lastError, serverTimeOffset, selfId } = useGame();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const last = room?.events.at(-1);
  const lines = [
    `build ${__BUILD_SHA__} · ${mode === "mock" ? "LOCAL DEMO (in-tab engine)" : `live · ${API_ORIGIN.replace(/^https?:\/\//, "")}`}`,
    `net ${connection} · offset ${Math.round(serverTimeOffset)} ms`,
    room ? `room ${room.code} v${room.version} · ${room.phase} · ${room.players.filter((p) => p.connected).length}/${room.players.length} online` : "no room",
    room ? `systems ${Object.entries(room.systems).filter(([, on]) => on).map(([k]) => k).join(",") || "none"}` : "",
    last ? `event #${last.seq} ${last.type}` : "",
    selfId ? `me ${selfId.slice(0, 6)}…` : "",
    lastError ? `error ${lastError.code} (${lastError.action})` : "",
  ].filter(Boolean);
  return (
    <aside className="debug-overlay" aria-label="Debug information">
      <button type="button" onClick={() => setOpen((o) => !o)}>{open ? "DEBUG ▾" : "DEBUG ▸"}</button>
      {open && <pre>{lines.join("\n")}</pre>}
    </aside>
  );
}
