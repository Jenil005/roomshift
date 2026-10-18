import { MODULES, MODULE_LABEL } from "@shared/puzzles/commsBoot";
import { MODULE_HINT, powerPercent } from "../game/content";
import { useGame } from "../game/useGame";
import { Button, Label, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { ServerError } from "../ui/ServerError";
import { useSecondsUntil } from "../ui/time";
import { useBootDraft } from "../ui/useBootDraft";

/**
 * Comms Boot Sequence (docs/PUZZLE_2_SPEC.md). The boot order is one shared draft on the
 * server: every tap is a puzzle2:draft request, so all terminals show the same order.
 * Each player holds private constraints; the server judges the submitted order.
 */
export function Puzzle2() {
  const { room, clue, send, lastSubmit, serverTimeOffset } = useGame();
  const { draft, toggle, clear, busy } = useBootDraft();
  const progress = room?.puzzles[2];
  const cooldown = useSecondsUntil(progress?.retryAt ? progress.retryAt - serverTimeOffset : null);
  if (!room) return null;
  const hints = room.puzzle2?.hints ?? [];

  const submit = () =>
    void send({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 2, order: draft } });
  const rejected = lastSubmit?.puzzle === 2 && !lastSubmit.solved;

  return (
    <Screen>
      <MissionHeader step="Puzzle 2 of 3" title="Comms boot sequence" />
      <div className="flex flex-col gap-1 bg-manual p-3 text-bunker bevel-paper">
        <span className="font-display text-[18px] text-panel">Your maintenance notes (private)</span>
        {clue ? clue.clues.map((line) => <p key={line} className="m-0 text-[22px] leading-tight">{line}</p>) : <p className="m-0">Receiving notes…</p>}
      </div>
      {hints.length > 0 && (
        <div className="flex flex-col gap-1 bg-inset p-3 bevel-sunken" aria-live="polite">
          <Label>Terminal hints (everyone sees these)</Label>
          {hints.map((h) => <p key={h} className="m-0 text-phosphor">{h}</p>)}
        </div>
      )}

      <section className="flex flex-col gap-2" aria-label="Shared boot order">
        <Label>Shared boot order · tap to add or remove</Label>
        <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={`flex h-14 flex-col items-center justify-center text-center font-display text-[14px] ${draft[i] ? "bg-panel text-phosphor bevel-raised" : "bg-inset text-bevel bevel-sunken"}`}>
              <span className="text-[11px] text-label">{i + 1}</span>
              {draft[i] ? MODULE_LABEL[draft[i]] : "—"}
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          {MODULES.map((m) => {
            const pos = draft.indexOf(m);
            return (
              <button
                key={m}
                type="button"
                disabled={busy}
                aria-pressed={pos >= 0}
                onClick={() => void toggle(m)}
                className={`flex min-h-16 flex-col items-center justify-center bg-inset font-display text-[20px] ${pos >= 0 ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}
              >
                {MODULE_LABEL[m]}
                <span className="font-body text-[14px] text-label">{pos >= 0 ? `slot ${pos + 1}` : MODULE_HINT[m]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {rejected && cooldown > 0 && <p role="alert" className="m-0 text-emergency">{lastSubmit.reason ?? "Sequence rejected"}. Terminal rebooting: {cooldown}s.</p>}
      {rejected && cooldown === 0 && <p role="alert" className="m-0 text-emergency">{lastSubmit.reason ?? "Sequence rejected"}. Compare notes and try again.</p>}
      <ServerError actions={["puzzle2:draft", "puzzle:submit"]} />
      <div className="flex-1" />
      <PowerBar value={powerPercent(room.systems)} />
      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy || draft.length === 0} onClick={clear}>Clear</Button>
        <Button className="flex-1" disabled={busy || draft.length !== MODULES.length || cooldown > 0} onClick={submit}>
          {cooldown > 0 ? `Rebooting ${cooldown}s` : "Boot terminal"}
        </Button>
      </div>
    </Screen>
  );
}
