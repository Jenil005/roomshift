import { useState } from "react";
import { OBJECT_IDS } from "@shared/constants";
import type { ObjectId } from "@shared/types";
import { OBJECT_LABEL, powerPercent } from "../game/content";
import { useGame } from "../game/useGame";
import { Button, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { ServerError } from "../ui/ServerError";
import { useSecondsUntil } from "../ui/time";

export function Puzzle1() {
  const { room, clue, send, pending, lastSubmit } = useGame();
  const [order, setOrder] = useState<ObjectId[]>([]);
  const retry = useSecondsUntil(lastSubmit?.puzzle === 1 ? lastSubmit.retryAt : null);
  if (!room) return null;

  const tap = (id: ObjectId) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  // Manual report: labeled as such on the server (verifiedBy: "manual"). The server judges it.
  const submit = () =>
    void send({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 1, physical: { source: "manual", order } } });
  const rejected = lastSubmit?.puzzle === 1 && !lastSubmit.solved;

  return (
    <Screen className="ar-screen">
      <MissionHeader step="Puzzle 1 of 3" title="Physical order" />
      <p className="ar-clue m-0 bg-inset p-3 bevel-sunken">
        <span className="text-label">Your fragment: </span>{clue?.clues.join(" ") ?? "Receiving…"}
      </p>
      <p className="m-0">Arrange the real objects, then tap them in the order they sit on the table, left to right.</p>
      <div className="grid grid-cols-3 gap-2">
        {OBJECT_IDS.map((id) => {
          const pos = order.indexOf(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => tap(id)}
              className={`flex h-20 flex-col items-center justify-center bg-inset font-display text-[20px] ${pos >= 0 ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}
            >
              {OBJECT_LABEL[id]}
              <span className="font-body text-[18px]">{pos >= 0 ? `#${pos + 1}` : "—"}</span>
            </button>
          );
        })}
      </div>
      {rejected && <p role="alert" className="m-0 text-emergency">{lastSubmit.reason ?? "Arrangement rejected"}.{retry > 0 ? ` Breaker resetting ${retry}s.` : " Compare your fragments and try again."}</p>}
      <ServerError actions={["puzzle:submit"]} />
      <Button disabled={order.length !== OBJECT_IDS.length || pending === "puzzle:submit" || retry > 0} onClick={submit}>Report arrangement</Button>
      <div className="flex-1" />
      <PowerBar value={powerPercent(room.systems)} />
    </Screen>
  );
}
