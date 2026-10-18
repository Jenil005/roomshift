import { useEffect, useState } from "react";
import type { MissionClock } from "@shared/types";

/** Server-synced "now", ticking once a second (stepped, like the rest of the HUD). */
export function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
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

/** Milliseconds left on the mission clock at server time `now` (stops while paused). */
export function timeLeft(clock: MissionClock, now: number) {
  const elapsed = (clock.pausedAt ?? now) - clock.startedAt - clock.pausedMs;
  return Math.max(0, clock.durationMs - elapsed);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
