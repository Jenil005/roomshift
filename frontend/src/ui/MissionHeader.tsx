import { useGame } from "../game/useGame";
import { ROLE_TITLE } from "../game/content";
import { FacilityButton } from "./FacilityButton";
import { formatClock, useServerNow } from "./time";

// Room events are bounded, so remember each room's start once seen (lost on reload: the clock hides).
const startedAt = new Map<string, number>();

/** Step + title + this player's role. The clock shows time since the mission began (the server has no deadline). */
export function MissionHeader({ step, title }: { step: string; title: string }) {
  const { room, clue, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  const seen = room?.events.find((e) => e.type === "game:advance" && e.to === "INTRO")?.at;
  if (room && seen) startedAt.set(room.code, seen);
  const started = room ? startedAt.get(room.code) : undefined;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-display text-[18px] font-bold text-label">MISSION</span>
        <span className="h-[3px] flex-1 bg-rule" />
        {started && <span className="font-numeric text-[20px] font-bold text-phosphor" role="timer" aria-label="Mission time">{formatClock(now - started)}</span>}
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
