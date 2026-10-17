import { useEffect, useState } from "react";
import type { MissionTimer } from "../shared/types";

/** Time left on the mission clock: frozen while paused, never below zero. */
export function timeLeft(timer: MissionTimer, now: number) {
  return Math.max(0, timer.deadline !== null ? timer.deadline - now : timer.pausedRemainingMs ?? 0);
}

/** Server-synced "now", ticking once a second (stepped, like the life bar should). */
export function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
