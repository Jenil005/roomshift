import { useState } from "react";
import { DEV_JUMP_PHASES, type DevJumpPhase } from "@shared/events";
import { DEV_TIMER_MAX_MS } from "@shared/constants";
import { useGame } from "../game/GameProvider";
import type { DevCommand } from "../shared/types";
import { formatClock, timeLeft, useServerNow } from "../ui/time";

const LIVE = import.meta.env.VITE_GAME_CLIENT === "deepspace";

/**
 * Add ?dev to the URL for testing shortcuts. The same commands run in the mock and on the real
 * server (dev:command, see docs/game-api.md); on the server only the room host may use them.
 */
export function DevPanel() {
  const { state, selfId, serverTimeOffset, send } = useGame();
  const now = useServerNow(serverTimeOffset);
  const [open, setOpen] = useState(false);
  const isHost = state?.players.find((p) => p.id === selfId)?.isHost ?? false;
  if (LIVE && !isHost) return null;

  const dev = (command: DevCommand) => send({ type: "dev", command });
  const timer = state?.timer ?? null;
  const left = timer ? timeLeft(timer, now) : 0;
  const paused = timer?.deadline === null;
  const setLeft = (ms: number) => dev({ kind: "timer:set", remainingMs: Math.min(DEV_TIMER_MAX_MS, Math.max(1000, ms)) });
  const btn = "min-h-10 border-2 border-bevel bg-void px-2 font-display text-[14px] text-phosphor disabled:opacity-40";

  return (
    <div className="fixed bottom-2 left-2 z-[60] flex flex-col items-start gap-2">
      {open && (
        <div className="flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 border-2 border-fault bg-bunker p-2 text-[14px] text-soft">
          <div className="flex justify-between font-display text-fault">
            <span>Dev tools</span>
            <span>{state?.phase ?? "no room"}</span>
          </div>

          <span className="text-label">Timer {timer ? `${formatClock(left)}${paused ? " · paused" : ""}` : "· not running"}</span>
          <div className="grid grid-cols-3 gap-1">
            <button className={btn} disabled={!timer} onClick={() => dev({ kind: paused ? "timer:resume" : "timer:pause" })}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button className={btn} disabled={!timer} onClick={() => setLeft(10_000)}>10 s left</button>
            <button className={btn} disabled={!timer} onClick={() => setLeft(60_000)}>1 min left</button>
            <button className={btn} disabled={!timer} onClick={() => setLeft(left + 60_000)}>+1 min</button>
            <button className={btn} disabled={!timer} onClick={() => timer && setLeft(timer.durationMs)}>Full time</button>
          </div>

          <span className="text-label">Stage</span>
          <div className="grid grid-cols-2 gap-1">
            <button className={btn} onClick={() => dev({ kind: "clear" })}>Clear stage</button>
            <button className={btn} onClick={() => dev({ kind: "win" })}>Instant win</button>
            <button className={`${btn} !text-fault`} onClick={() => dev({ kind: "fail" })}>Instant fail</button>
            <button className={btn} disabled={!state} onClick={() => send({ type: "game:reset" })}>Reset to lobby</button>
          </div>
          <select
            aria-label="Jump to stage"
            value=""
            onChange={(e) => e.target.value && dev({ kind: "jump", phase: e.target.value as DevJumpPhase })}
            className="min-h-10 bg-void p-1 text-[16px] text-phosphor"
          >
            <option value="">Jump to stage…</option>
            {DEV_JUMP_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {state?.lastError && <span className="text-emergency">{state.lastError}</span>}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border-2 border-fault bg-void px-3 py-1 font-display text-[14px] text-fault"
      >
        {open ? "Close dev" : "Dev"}
      </button>
    </div>
  );
}
