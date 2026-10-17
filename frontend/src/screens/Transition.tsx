import { useGame } from "../game/GameProvider";
import { NARRATION } from "../game/content";
import { PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";

export function Transition({ which }: { which: 1 | 2 }) {
  const { state } = useGame();
  if (!state) return null;
  return (
    <Screen>
      <MissionHeader step={`Puzzle ${which} of 3`} title="Verified" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="font-display text-[44px] font-bold leading-none text-phosphor">Sequence<br />accepted</span>
        <p className="m-0 text-soft">{state.narration ?? (which === 1 ? NARRATION.puzzle1Complete : NARRATION.puzzle2Complete)}</p>
      </div>
      <PowerBar value={state.power} />
    </Screen>
  );
}
