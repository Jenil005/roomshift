import { MISSION_DURATION_MS } from "@shared/constants";
import type { MissionClock, Room } from "@shared/types";
import { useGame } from "../game/useGame";
import { ROLE_TITLE } from "../game/content";
import { FacilityButton } from "./FacilityButton";
import { LifeBar } from "./LifeBar";
import { timeLeft, useServerNow } from "./time";

/** The server's mission clock; a backend without one (no pause) sends only missionStartedAt. */
function missionClock(room: Room): MissionClock | undefined {
  if (room.mission) return room.mission;
  return room.missionStartedAt ? { startedAt: room.missionStartedAt, durationMs: MISSION_DURATION_MS, pausedMs: 0 } : undefined;
}

/**
 * Step + title + this player's role. The LIFE bar counts down the server's mission clock,
 * which starts when the host proceeds from the role reveal and may be paused by the host, so
 * every phone, reload and screen switch shows the same time. Display only: 00:00 does not
 * end the mission.
 */
export function MissionHeader({ step, title }: { step: string; title: string }) {
  const { room, clue, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  const clock = room ? missionClock(room) : undefined;
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
