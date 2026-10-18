import { useGame } from "../game/useGame";

function RadioText({ text, delay, className = "", shakeAfter = false }: { text: string; delay: number; className?: string; shakeAfter?: boolean }) {
  const letters = Array.from(text);
  const shakeDelay = delay + (letters.length - 1) * 0.06 + 0.35;

  return (
    <span
      className={`radio-message ${shakeAfter ? "radio-message-shake" : ""} ${className}`}
      aria-label={text}
      style={shakeAfter ? { animationDelay: `${shakeDelay}s` } : undefined}
    >
      <span aria-hidden="true">
        {letters.map((letter, index) => (
          <span className="radio-letter-window" key={`${index}-${letter}`}>
            <span className="radio-letter" style={{ animationDelay: `${delay + index * 0.06}s` }}>
              {letter === " " ? "\u00a0" : letter}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

// Radio lines scroll in letter by letter before the final call shakes into place.
// The server has no defeat state, so this screen is shown when the room is gone (closed,
// idle timeout, or this seat was removed): an honest "signal lost", never a fake game over.
export function Failed() {
  const { lastError, clearError } = useGame();
  const at = (s: number) => ({ animationDelay: `${s}s` });
  const followupAt = at(5.4);

  return (
    <div className="min-h-dvh bg-void">
      <main className="screen-shell mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-7 pt-10">
        <div className="flex items-center gap-2">
          <span className="font-display text-[18px] font-bold text-fault">SIGNAL</span>
          <div className="h-[14px] flex-1 bg-void bevel-sunken !border-2" />
          <span className="font-numeric text-[20px] font-bold text-fault">0%</span>
        </div>
        <div className="flex flex-col gap-1 bg-bunker p-4 bevel-raised" aria-live="polite">
          <span className="font-display text-[16px] text-label">Incoming, channel 04</span>
          <div className="flex flex-col gap-1 overflow-hidden">
            <RadioText text="Operatives, report." delay={0.2} className="text-soft" />
            <RadioText text="Operatives?" delay={2} className="text-[28px]" />
            <RadioText text="OPERATIVES!!" delay={3.3} className="font-display text-[38px] font-bold leading-none text-fault" shakeAfter />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="after-radio" style={followupAt}>
            <h1 className="failure-title m-0 text-center font-display text-[84px] font-bold leading-[0.88] tracking-[4px] text-fault title-fault">SIGNAL<br />LOST</h1>
          </div>
          <p className="after-radio m-0 text-center text-soft" style={followupAt}>{lastError?.message ?? "The room has closed."} Start or join a new room to keep playing.</p>
        </div>
        <div className="after-radio flex flex-col gap-2" style={followupAt}>
          <button onClick={clearError} className="flex min-h-14 items-center gap-3 bg-panel px-4 text-left font-display text-[26px] font-bold bevel-raised">
            <span aria-hidden className="text-fault">▶</span>Continue
          </button>
        </div>
      </main>
    </div>
  );
}
