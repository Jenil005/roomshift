import { useState } from "react";
import { useGame } from "../game/GameProvider";
import { OBJECT_LABEL } from "../game/content";
import type { ObjectId } from "../shared/types";
import { Button, ErrorLine, PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { CameraView } from "../ui/CameraView";

const OBJECTS: ObjectId[] = ["BOOK", "CUP", "KEYS"];

export function Puzzle1() {
  const { state, briefing, send } = useGame();
  const [manual, setManual] = useState(false);
  const [order, setOrder] = useState<ObjectId[]>([]);
  if (!state || !briefing) return null;

  const tap = (id: ObjectId) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const submit = () => {
    send({ type: "puzzle:submit", puzzle: 1, result: { solved: order.length === 3, detectedIds: order, order } });
    setOrder([]);
  };

  return (
    <Screen className="ar-screen">
      <MissionHeader step="Puzzle 1 of 3" title="Physical order" role={briefing.title} />
      <p className="ar-clue m-0 bg-inset p-3 bevel-sunken">
        <span className="text-label">Your fragment: </span>{briefing.puzzle1Clue}
      </p>

      {!manual ? (
        <>
          <CameraView onResult={(result) => send({ type: "puzzle:submit", puzzle: 1, result })} />
          <p className="ar-instruction m-0">Arrange the objects on the table, then point the camera at them, left to right.</p>
        </>
      ) : (
        <>
          <p className="m-0">Tap the objects in the order they sit on the table, left to right.</p>
          <div className="grid grid-cols-3 gap-2">
            {OBJECTS.map((id) => {
              const pos = order.indexOf(id);
              return (
                <button
                  key={id}
                  onClick={() => tap(id)}
                  className={`flex h-20 flex-col items-center justify-center bg-inset font-display text-[20px] ${pos >= 0 ? "border-[3px] border-phosphor text-phosphor" : "border-[3px] border-dashed border-emergency text-emergency"}`}
                >
                  {OBJECT_LABEL[id]}
                  <span className="font-body text-[18px]">{pos >= 0 ? `#${pos + 1}` : "—"}</span>
                </button>
              );
            })}
          </div>
          <Button disabled={order.length !== 3} onClick={submit}>Submit sequence</Button>
        </>
      )}

      <ErrorLine message={state.lastError} />
      <div className="flex-1" />
      <PowerBar value={state.power} />
      <Button variant="ghost" onClick={() => setManual((m) => !m)}>
        {manual ? "Back to camera" : "Camera not working? Confirm manually"}
      </Button>
    </Screen>
  );
}
