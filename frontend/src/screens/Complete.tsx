import { useGame } from "../game/GameProvider";
import { NARRATION } from "../game/content";
import { formatClock } from "../ui/time";

export function Complete() {
  const { state, selfId, send } = useGame();
  if (!state) return null;
  const took = state.completedAt && state.startedAt ? formatClock(state.completedAt - state.startedAt) : "--:--";
  const isHost = state.players.find((p) => p.id === selfId)?.isHost;

  return (
    // The only light screen in the game: every phone flips at once.
    <div className="min-h-dvh bg-manual text-bunker">
      <main className="screen-shell mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-7 pt-14">
        <h1 className="result-title m-0 text-center font-display text-[56px] font-bold leading-[0.95]">POWER<br />RESTORED</h1>
        <dl className="m-0 flex flex-col gap-1 bg-white p-4 bevel-paper">
          <div className="flex justify-between"><dt>Lockdown</dt><dd className="m-0 font-display">Disabled</dd></div>
          <div className="flex justify-between"><dt>Mission</dt><dd className="m-0 font-display">Complete</dd></div>
          <div className="flex justify-between"><dt>Completion time</dt><dd className="m-0 font-numeric font-bold">{took}</dd></div>
        </dl>
        <p className="m-0 text-center text-[28px] text-panel">{state.narration ?? NARRATION.complete}</p>
        <div className="flex-1" />
        {isHost && (
          <button onClick={() => send({ type: "game:reset" })} className="min-h-16 bg-bunker font-display text-[26px] font-bold text-manual bevel-raised">
            Run it again
          </button>
        )}
      </main>
    </div>
  );
}
