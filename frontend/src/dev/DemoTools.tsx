import { useState } from "react";
import type { GamePhase } from "@shared/types";
import { useGame, useMe } from "../game/useGame";

// Phases the server accepts demo commands in (backend engine DEMO_PHASES).
const DEMO_PHASES: ReadonlySet<GamePhase> = new Set([
  "INTRO",
  "PUZZLE_1",
  "PUZZLE_1_COMPLETE",
  "PUZZLE_2",
  "PUZZLE_2_COMPLETE",
  "FINAL_SEQUENCE",
]);

const TOOL = "min-h-11 border-2 px-2 font-display text-[16px] font-bold disabled:opacity-40";

/**
 * HOST ONLY. Demo controls for presenting the game: skip the current stage, pause the
 * mission clock, or end the mission as a win or a fail. The server checks the host and the
 * phase; this panel only hides itself from everyone else.
 */
export function DemoTools() {
  const { room, send, pending, lastError } = useGame();
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!room || !me?.isHost || !DEMO_PHASES.has(room.phase)) return null;
  const paused = room.mission?.pausedAt !== undefined;
  const busy = pending?.startsWith("demo:") ?? false;
  const error = lastError?.action.startsWith("demo:")
    ? lastError.code === "bad_request"
      ? "This backend has no demo tools yet. Deploy the backend, or use the local demo."
      : lastError.message
    : null;

  return (
    <aside className="fixed bottom-2 right-2 z-[60] w-[min(calc(100%-16px),220px)] border-2 border-emergency bg-void/95 p-2 text-[14px]" aria-label="Demo tools">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left font-display text-emergency" aria-expanded={open}>
        {open ? "▼ DEMO TOOLS (host)" : "▶ DEMO TOOLS"}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className={`${TOOL} border-phosphor text-phosphor`} disabled={busy} onClick={() => void send({ type: "demo:skip" })}>
            Skip stage
          </button>
          <button
            type="button"
            className={`${TOOL} border-emergency text-emergency`}
            disabled={busy || !room.mission}
            title={room.mission ? undefined : "The timer starts with puzzle 1"}
            onClick={() => void send({ type: "demo:pause", paused: !paused })}
          >
            {paused ? "Resume timer" : "Pause timer"}
          </button>
          <button type="button" className={`${TOOL} border-phosphor bg-phosphor text-bunker`} disabled={busy} onClick={() => void send({ type: "demo:win" })}>
            Insta win
          </button>
          <button type="button" className={`${TOOL} border-fault bg-fault text-bunker`} disabled={busy} onClick={() => void send({ type: "demo:fail" })}>
            Insta fail
          </button>
          {error && <p role="alert" className="col-span-2 m-0 text-[13px] leading-tight text-fault">{error}</p>}
        </div>
      )}
    </aside>
  );
}
