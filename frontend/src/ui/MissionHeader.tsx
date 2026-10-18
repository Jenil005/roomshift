import { MISSION_DURATION_MS } from "@shared/constants";
import type { MissionClock, Room } from "@shared/types";
import { useGame } from "../game/useGame";
import { ROLE_TITLE } from "../game/content";
import { FacilityButton } from "./FacilityButton";
import { LifeBar } from "./LifeBar";
import { timeLeft, useServerNow } from "./time";

// Fallback for a backend without `room.mission`: the clock starts at the PUZZLE_1 advance
// event. Room events are bounded, so remember each room's start once seen (lost on reload).
const startedAt = new Map<string, number>();
function fallbackClock(room: Room): MissionClock | undefined {
  const seen = room.events.find((e) => e.type === "game:advance" && e.to === "PUZZLE_1")?.at;
  if (seen) startedAt.set(room.code, seen);
  const start = startedAt.get(room.code);
  return start ? { startedAt: start, durationMs: MISSION_DURATION_MS, pausedMs: 0 } : undefined;
}

/**
 * Step + title + this player's role. The LIFE bar shows the server's mission clock, which
 * starts with puzzle 1 and can be paused by the host. Reaching zero only turns the bar red.
 */
export function MissionHeader({ step, title }: { step: string; title: string }) {
  const { room, clue, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  const clock = room ? (room.mission ?? fallbackClock(room)) : undefined;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {clock ? (
          <div className="flex-1">
            <LifeBar left={timeLeft(clock, now)} total={clock.durationMs} paused={clock.pausedAt !== undefined} />
          </div>
        ) : (
          <>
            <span className="font-display text-[18px] font-bold text-label">MISSION</span>
            <span className="h-[3px] flex-1 bg-rule" />
          </>
        )}
        <FacilityButton />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-label">{step}</span>
        {clue && <span className="ml-auto text-right text-emergency">{ROLE_TITLE[clue.role]}</span>}
        <span className="mission-heading font-display text-[28px] font-bold leading-none">{title}</span>
      </div>
    </header>
  );
}
