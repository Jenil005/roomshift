import { NARRATION, narrationFor, powerPercent } from "../game/content";
import { useGame } from "../game/useGame";
import { PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";

export function Transition({ which }: { which: 1 | 2 }) {
  const { room } = useGame();
  if (!room) return null;
  const verifiedBy = room.puzzles[1].verifiedBy;
  return (
    <Screen>
      <MissionHeader step={`Puzzle ${which} of 3`} title="Verified" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="font-display text-[44px] font-bold leading-none text-phosphor">{which === 1 ? "Breaker" : "Comms"}<br />online</span>
        <p className="m-0 text-soft">{narrationFor(room, which === 1 ? NARRATION.puzzle1Complete : NARRATION.puzzle2Complete)}</p>
        {which === 1 && verifiedBy && (
          <p className="m-0 text-label">{verifiedBy === "camera" ? "Verified from camera evidence" : "Verified from a manual report"}</p>
        )}
      </div>
      <PowerBar value={powerPercent(room.systems)} />
    </Screen>
  );
}
