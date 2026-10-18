import { FINAL_SYNC_WINDOW_MS } from "@shared/constants";
import { powerPercent } from "../game/content";
import { useGame, useMe } from "../game/useGame";
import { Button, Label, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { ServerError } from "../ui/ServerError";
import { useFinalHold } from "../ui/useFinalHold";
import { useSecondsUntil } from "../ui/time";

/**
 * FINAL_SEQUENCE: the blast door opens when every connected player holds ACTIVATE at once
 * (a release within FINAL_SYNC_WINDOW_MS still counts). The server decides; the host may
 * force the door after room.final.forceAvailableAt.
 */
export function FinalOverride() {
  const { room, selfId, send, serverTimeOffset } = useGame();
  const me = useMe();
  const { holding, handlers } = useFinalHold();
  const forceIn = useSecondsUntil(room?.final ? room.final.forceAvailableAt - serverTimeOffset : null);
  if (!room) return null;
  const onPanel = new Set(room.final?.holding ?? []);
  const connected = room.players.filter((p) => p.connected);

  return (
    <Screen>
      <MissionHeader step="Puzzle 3 of 3" title="Blast door override" />
      <p className="m-0 bg-panel p-3 bevel-raised">
        Count down together, then everyone holds at the same moment. Letting go for more than {FINAL_SYNC_WINDOW_MS / 1000}s breaks the circuit.
      </p>

      <section className="flex flex-col gap-2">
        <Label>Hands on the panel · {onPanel.size} of {connected.length}</Label>
        <div className="grid grid-cols-2 gap-2">
          {room.players.map((p) => {
            const on = onPanel.has(p.id);
            return (
              <div key={p.id} className={`truncate p-2 text-center ${!p.connected ? "border-[3px] border-rule text-bevel" : on ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}>
                {p.id === selfId ? "You" : p.name}{p.connected ? "" : " (away)"}
              </div>
            );
          })}
        </div>
      </section>

      <ServerError actions={["final:press", "final:force"]} />
      <div className="flex-1" />
      <PowerBar value={powerPercent(room.systems)} />
      {me?.isHost && (
        <Button variant="ghost" disabled={forceIn > 0} onClick={() => void send({ type: "final:force" })}>
          {forceIn > 0 ? `Manual override available in ${forceIn}s` : "Force the door (host)"}
        </Button>
      )}
      <button
        type="button"
        {...handlers}
        aria-pressed={holding}
        className={`hold-action h-40 select-none touch-none font-display text-[34px] font-bold leading-none bevel-amber ${holding ? "translate-y-1 bg-phosphor text-bunker" : "bg-emergency text-bunker"}`}
      >
        {holding ? "Holding…" : <>Hold to<br />activate</>}
      </button>
    </Screen>
  );
}
