import { useGame } from "../game/GameProvider";
import { OBJECT_LABEL } from "../game/content";
import { Button, ErrorLine, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";

export function Puzzle2() {
  const { state, selfId, briefing, send } = useGame();
  if (!state || !briefing || !selfId) return null;
  const target = briefing.puzzle2Target;
  const scanned = state.puzzle2Scans[selfId] !== undefined;
  const scanCount = Object.keys(state.puzzle2Scans).length;

  return (
    <Screen>
      <MissionHeader step="Puzzle 2 of 3" title="Synchronize relays" />
      <div className="flex flex-col gap-1 bg-manual p-4 text-bunker bevel-paper">
        <span className="font-display text-[18px] text-panel">{target ? `Your target: ${OBJECT_LABEL[target]}` : "Your job: timing"}</span>
        <p className="m-0 text-[28px] leading-none">{briefing.puzzle2Brief}</p>
      </div>

      <div className="flex-1" />
      <p className="m-0 text-soft">{scanCount} relay{scanCount === 1 ? "" : "s"} scanned</p>
      <ErrorLine message={state.lastError} />
      <PowerBar value={state.power} />
      {target ? (
        // TODO(AR): swap this button for a marker scan of `target` from the AR module.
        <Button className="sync-action min-h-36 text-[32px]" disabled={scanned} onClick={() => send({ type: "puzzle:submit", puzzle: 2, target })}>
          {scanned ? "Scanned, waiting on partner" : `Scan the ${OBJECT_LABEL[target].toLowerCase()}`}
        </Button>
      ) : (
        <p className="m-0 bg-inset p-4 text-center text-emergency bevel-sunken">You don’t scan. Run the countdown out loud.</p>
      )}
    </Screen>
  );
}
