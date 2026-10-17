import { useState } from "react";
import { useGame } from "../game/GameProvider";
import { Button, ErrorLine, Label, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";

export function FinalOverride() {
  const { state, selfId, briefing, send } = useGame();
  const [code, setCode] = useState("");
  const [holding, setHolding] = useState(false);
  if (!state || !briefing || !selfId) return null;

  const mine = new Map(briefing.overrideFragments.map((f) => [f.position, f.digit]));
  const setHold = (h: boolean) => {
    if (h === holding) return;
    setHolding(h);
    send({ type: "final:activate", holding: h });
  };

  return (
    <Screen>
      <MissionHeader step="Puzzle 3 of 3" title="Final override" />
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((pos) => (
          <div
            key={pos}
            className={`flex h-24 items-center justify-center font-numeric text-[56px] font-bold ${mine.has(pos) ? "bg-manual text-bunker bevel-paper" : "bg-inset text-panel bevel-sunken"}`}
          >
            {mine.get(pos) ?? "?"}
          </div>
        ))}
      </div>
      <p className="m-0">You hold {mine.size === 1 ? "one digit" : "two digits"}. Get the rest out loud from your team.</p>

      {!state.finalCodeAccepted ? (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-label="Full override code"
            placeholder="###"
            className="h-16 w-32 bg-inset text-center font-numeric text-[32px] tracking-[0.3em] text-manual bevel-sunken placeholder:text-bevel"
          />
          <Button variant="secondary" className="flex-1" disabled={code.length !== 3} onClick={() => send({ type: "final:code", code })}>
            Enter code
          </Button>
        </div>
      ) : (
        <p className="m-0 text-phosphor">Code accepted. Everyone, hands on the panel.</p>
      )}
      <ErrorLine message={state.lastError} />

      <section className="flex flex-col gap-2">
        <Label>Hands on the panel</Label>
        <div className="grid grid-cols-3 gap-2">
          {state.players.map((p) => {
            const on = state.finalHolding.includes(p.id);
            return (
              <div key={p.id} className={`truncate p-2 text-center ${on ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}>
                {p.id === selfId ? "You" : p.name}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex-1" />
      <button
        disabled={!state.finalCodeAccepted}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setHold(true); }}
        onPointerUp={() => setHold(false)}
        onPointerCancel={() => setHold(false)}
        onContextMenu={(e) => e.preventDefault()}
        className={`hold-action h-40 select-none touch-none font-display text-[34px] font-bold leading-none bevel-amber ${holding ? "translate-y-1 bg-phosphor text-bunker" : "bg-emergency text-bunker"}`}
      >
        {holding ? "Holding…" : <>Hold to<br />activate</>}
      </button>
    </Screen>
  );
}
