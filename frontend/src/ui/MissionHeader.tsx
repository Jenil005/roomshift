import { MISSION_DURATION_MS } from "@shared/constants";
import { useGame } from "../game/useGame";
import { ROLE_TITLE } from "../game/content";
import { FacilityButton } from "./FacilityButton";
import { formatClock, missionRemainingMs, useServerNow } from "./time";

/**
 * Step + title + this player's role. The clock counts down MISSION_DURATION_MS from the
 * server's room.missionStartedAt (set when the host proceeds), so every phone, reload and
 * screen switch shows the same time. Display only: 00:00 does not end the mission.
 */
export function MissionHeader({ step, title }: { step: string; title: string }) {
  const { room, clue, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  const started = room?.missionStartedAt;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-display text-[18px] font-bold text-label">MISSION</span>
        <span className="h-[3px] flex-1 bg-rule" />
        {started && <span className="font-numeric text-[20px] font-bold text-phosphor" role="timer" aria-label="Mission time remaining">{formatClock(missionRemainingMs(started, now, MISSION_DURATION_MS))}</span>}
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
