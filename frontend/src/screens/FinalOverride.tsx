import { useState } from "react";
import { useGame } from "../game/GameProvider";
import { Button, ErrorLine, Label, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { useServerNow } from "../ui/time";

// Final sequence: the door opens when every connected player holds at the same moment.
// After a while the host can force it so a demo never gets stuck.
export function FinalOverride() {
  const { state, selfId, serverTimeOffset, send } = useGame();
  const now = useServerNow(serverTimeOffset);
  const [holding, setHolding] = useState(false);
  if (!state || !selfId) return null;

  const isHost = state.players.find((p) => p.id === selfId)?.isHost;
  const forceIn = state.finalForceAt ? Math.ceil((state.finalForceAt - now) / 1000) : null;
  const setHold = (h: boolean) => {
    if (h === holding) return;
    setHolding(h);
    send({ type: "final:activate", holding: h });
  };

  return (
    <Screen>
      <MissionHeader step="Puzzle 3 of 3" title="Blast door" />
      <p className="m-0">Everyone, hands on the panel. The door only opens if you all hold at the same time.</p>
      <ErrorLine message={state.lastError} />

      <section className="flex flex-col gap-2">
        <Label>Hands on the panel</Label>
        <div className="grid grid-cols-2 gap-2">
          {state.players.map((p) => {
            const on = state.finalHolding.includes(p.id);
            return (
              <div
                key={p.id}
                className={`truncate p-2 text-center ${!p.connected ? "border-[3px] border-dashed border-rule text-bevel" : on ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}
              >
                {p.id === selfId ? "You" : p.name}{!p.connected && " (away)"}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex-1" />
      {isHost && forceIn !== null && (
        <Button variant="ghost" disabled={forceIn > 0} onClick={() => send({ type: "final:force" })}>
          {forceIn > 0 ? `Manual override available in ${forceIn}s` : "Force the door (host override)"}
        </Button>
      )}
      <button
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setHold(true); }}
        onPointerUp={() => setHold(false)}
        onPointerCancel={() => setHold(false)}
        onContextMenu={(e) => e.preventDefault()}
        className={`hold-action h-40 select-none touch-none font-display text-[34px] font-bold leading-none bevel-amber ${holding ? "translate-y-1 bg-phosphor text-bunker" : "bg-emergency text-bunker"}`}
      >
        {holding ? "Holding…" : <>Hold to<br />unlock</>}
      </button>
    </Screen>
  );
}
