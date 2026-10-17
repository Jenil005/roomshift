import { formatClock } from "./time";

/** The countdown, drawn as a LIFE bar. Turns amber under 25%, red at zero. */
export function LifeBar({ now, startedAt, deadline }: { now: number; startedAt: number; deadline: number }) {
  const left = Math.max(0, deadline - now);
  const pct = Math.max(0, Math.min(100, (left / (deadline - startedAt)) * 100));
  const tone = left === 0 ? "text-fault" : pct <= 25 ? "text-emergency" : "text-phosphor";
  const fill = pct <= 25 ? "bg-emergency border-emergency-shine" : "bg-phosphor border-phosphor-shine";
  return (
    <div className="flex items-center gap-2" role="timer" aria-label={`Time left ${formatClock(left)}`}>
      <span className={`font-display text-[18px] font-bold ${tone}`}>LIFE</span>
      <div className="h-[14px] flex-1 bg-void p-[2px] bevel-sunken !border-2">
        {/* No CSS transition on purpose: the bar drops in steps, once a second. */}
        <div className={`h-full border-t-[3px] ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-numeric text-[20px] font-bold ${tone} ${pct <= 10 && left > 0 ? "blink" : ""}`}>{formatClock(left)}</span>
    </div>
  );
}
