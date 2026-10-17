import { NARRATION, narrationFor } from "../game/content";
import { useGame, useMe } from "../game/useGame";
import { formatClock } from "../ui/time";

export function Complete() {
  const { room, send } = useGame();
  const me = useMe();
  if (!room) return null;
  const started = room.events.find((e) => e.type === "game:advance" && e.to === "INTRO")?.at;
  const took = started ? formatClock(room.phaseStartedAt - started) : "--:--";

  return (
    // The only light screen in the game: every phone flips at once.
    <div className="min-h-dvh bg-manual text-bunker">
      <main className="screen-shell mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-7 pt-14">
        <h1 className="result-title m-0 text-center font-display text-[56px] font-bold leading-[0.95]">POWER<br />RESTORED</h1>
        <dl className="m-0 flex flex-col gap-1 bg-white p-4 bevel-paper">
          <div className="flex justify-between"><dt>Breaker</dt><dd className="m-0 font-display">{room.systems.breaker ? "Online" : "Offline"}</dd></div>
          <div className="flex justify-between"><dt>Comms</dt><dd className="m-0 font-display">{room.systems.terminal ? "Online" : "Offline"}</dd></div>
          <div className="flex justify-between"><dt>Blast door</dt><dd className="m-0 font-display">{room.systems.door ? "Open" : "Sealed"}</dd></div>
          <div className="flex justify-between"><dt>Completion time</dt><dd className="m-0 font-numeric font-bold">{took}</dd></div>
        </dl>
        <p className="m-0 text-center text-[28px] text-panel">{narrationFor(room, NARRATION.complete)}</p>
        <div className="flex-1" />
        {me?.isHost ? (
          <button onClick={() => void send({ type: "game:reset" })} className="min-h-16 bg-bunker font-display text-[26px] font-bold text-manual bevel-raised">
            Run it again
          </button>
        ) : (
          <p className="m-0 text-center text-panel">The host can start another run.</p>
        )}
      </main>
    </div>
  );
}
