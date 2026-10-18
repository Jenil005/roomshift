import { useEffect, useState } from "react";

/** Server-synced "now". Ticks 4x a second so phones flip the shown second within ~250 ms of each other. */
export function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

/** Whole seconds left until a local epoch-ms time; 0 when passed or unset. Re-renders while counting. */
export function useSecondsUntil(at: number | undefined | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at || at <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const stop = window.setTimeout(() => clearInterval(id), at - Date.now() + 300);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

/** Countdown left at server time `now` for a timer started at `startedAt`; never negative. */
export function missionRemainingMs(startedAt: number, now: number, durationMs: number) {
  return Math.max(0, Math.min(durationMs, startedAt + durationMs - now));
}

/** MM:SS, rounding partial seconds up (so a fresh 8-minute countdown reads 08:00); never negative. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
