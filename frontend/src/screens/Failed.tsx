import { useGame } from "../game/GameProvider";
import { NARRATION } from "../game/content";

// Lines reveal in sequence, then GAME OVER slams in with a shake, then the menu.
export function Failed() {
  const { state, send } = useGame();
  if (!state) return null;
  const at = (s: number) => ({ animationDelay: `${s}s` });

  return (
    <div className="min-h-dvh bg-void">
      <main className="screen-shell mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-7 pt-10">
        <div className="flex items-center gap-2">
          <span className="font-display text-[18px] font-bold text-fault">LIFE</span>
          <div className="h-[14px] flex-1 bg-void bevel-sunken !border-2" />
          <span className="font-numeric text-[20px] font-bold text-fault">00:00</span>
        </div>
        <div className="flex flex-col gap-1 bg-bunker p-4 bevel-raised" aria-live="polite">
          <span className="font-display text-[16px] text-label">Incoming, channel 04</span>
          <span className="reveal text-soft" style={at(0.2)}>Operatives, report.</span>
          <span className="reveal text-[28px]" style={at(0.8)}>Operatives?</span>
          <span className="reveal font-display text-[38px] font-bold leading-none text-fault" style={at(1.4)}>OPERATIVES!!</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="reveal" style={at(2.2)}>
            <h1 className="failure-title shake m-0 text-center font-display text-[84px] font-bold leading-[0.88] tracking-[4px] text-fault title-fault" style={at(2.2)}>GAME<br />OVER</h1>
          </div>
          <p className="reveal m-0 text-center text-soft" style={at(2.8)}>{NARRATION.failed} Power peaked at {state.power}%.</p>
        </div>
        <div className="reveal flex flex-col gap-2" style={at(3.2)}>
          <button onClick={() => send({ type: "game:reset" })} className="flex min-h-14 items-center gap-3 bg-panel px-4 text-left font-display text-[26px] font-bold bevel-raised">
            <span aria-hidden className="text-fault">▶</span>Continue
          </button>
          <button onClick={() => send({ type: "room:leave" })} className="min-h-14 border-[3px] border-rule bg-transparent pl-11 text-left font-display text-[26px] text-label">
            Exit
          </button>
        </div>
      </main>
    </div>
  );
}
