import { formatClock } from "./time";

/**
 * The countdown, drawn as a LIFE bar. Turns amber under 25%, red at zero. The MM:SS digits
 * are the `timer` element ("Mission time remaining"), so their text is the time alone.
 */
export function LifeBar({ left, total, paused = false }: { left: number; total: number; paused?: boolean }) {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const tone = left === 0 ? "text-fault" : pct <= 25 ? "text-emergency" : "text-phosphor";
  const fill = pct <= 25 ? "bg-emergency border-emergency-shine" : "bg-phosphor border-phosphor-shine";
  return (
    <div className="flex items-center gap-2">
      <span className={`font-display text-[18px] font-bold ${tone}`} aria-hidden="true">LIFE</span>
      <div className="h-[14px] flex-1 bg-void p-[2px] bevel-sunken !border-2" aria-hidden="true">
        {/* No CSS transition on purpose: the bar drops in steps, once a second. */}
        <div className={`h-full border-t-[3px] ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      {paused && <span className="font-display text-[16px] font-bold text-emergency blink" role="status">PAUSED</span>}
      <span
        className={`font-numeric text-[20px] font-bold ${tone} ${pct <= 10 && left > 0 && !paused ? "blink" : ""}`}
        role="timer"
        aria-label="Mission time remaining"
      >
        {formatClock(left)}
      </span>
    </div>
  );
}
