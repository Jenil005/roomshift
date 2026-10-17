import { MODULES, MODULE_LABEL } from "@shared/puzzles/commsBoot";
import { useGame } from "../game/GameProvider";
import type { ModuleId } from "../shared/types";
import { Button, ErrorLine, Label, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { Clues } from "../ui/Clues";
import { useServerNow } from "../ui/time";

// Comms Boot Sequence (docs/PUZZLE_2_SPEC.md): everyone edits one shared boot order live,
// each player holds different clues, anyone can press Boot.
export function Puzzle2() {
  const { state, briefing, serverTimeOffset, send } = useGame();
  const now = useServerNow(serverTimeOffset);
  if (!state || !briefing) return null;

  const draft = state.puzzle2Draft;
  const setDraft = (order: ModuleId[]) => send({ type: "puzzle2:draft", order });
  const toggle = (m: ModuleId) => setDraft(draft.includes(m) ? draft.filter((x) => x !== m) : [...draft, m]);
  const wait = state.retryAt ? Math.ceil((state.retryAt - now) / 1000) : 0;

  return (
    <Screen>
      <MissionHeader step="Puzzle 2 of 3" title="Comms boot sequence" />
      <div className="flex flex-col gap-1 bg-manual p-4 text-bunker bevel-paper">
        <span className="font-display text-[18px] text-panel">Maintenance record, your page</span>
        <Clues lines={briefing.clues} className="text-[24px]" />
      </div>

      <section className="flex flex-col gap-2">
        <Label>Boot order, shared with your team</Label>
        <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0">
          {MODULES.map((_, i) => {
            const m = draft[i];
            return (
              <li key={i}>
                <button
                  disabled={!m}
                  onClick={() => m && toggle(m)}
                  aria-label={m ? `Remove ${MODULE_LABEL[m]} from slot ${i + 1}` : `Slot ${i + 1} empty`}
                  className={`flex h-20 w-full flex-col items-center justify-center font-display text-[16px] ${m ? "bg-inset text-phosphor border-[3px] border-phosphor" : "bg-inset text-bevel border-[3px] border-dashed border-rule"}`}
                >
                  <span className="font-body text-[16px]">#{i + 1}</span>
                  {m ? MODULE_LABEL[m] : "—"}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          {MODULES.map((m) => (
            <Button key={m} variant={draft.includes(m) ? "ghost" : "secondary"} onClick={() => toggle(m)}>
              {MODULE_LABEL[m]}
            </Button>
          ))}
        </div>
      </section>

      {state.puzzle2Hints.length > 0 && (
        <section className="flex flex-col gap-1 bg-inset p-3 bevel-sunken">
          <Label>System hints</Label>
          {state.puzzle2Hints.map((h) => <p key={h} className="m-0 text-emergency">{h}</p>)}
        </section>
      )}

      <div className="flex-1" />
      <ErrorLine message={state.lastError} />
      <PowerBar value={state.power} />
      <Button
        className="sync-action min-h-24 text-[32px]"
        disabled={draft.length !== MODULES.length || wait > 0}
        onClick={() => send({ type: "puzzle:submit", puzzle: 2, order: draft })}
      >
        {wait > 0 ? `Rebooting… ${wait}s` : "Boot"}
      </Button>
    </Screen>
  );
}
