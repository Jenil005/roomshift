import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/useGame";

/**
 * Press-and-hold for FINAL_SEQUENCE (final:press held true/false). Releases automatically
 * when the component unmounts or the page is hidden, so no hold is left registered.
 */
export function useFinalHold() {
  const { room, send } = useGame();
  const [holding, setHolding] = useState(false);
  const heldRef = useRef(false);
  const phaseRef = useRef(room?.phase);
  useEffect(() => {
    phaseRef.current = room?.phase;
  });

  const setHold = (held: boolean) => {
    if (held === heldRef.current) return;
    heldRef.current = held;
    setHolding(held);
    void send({ type: "final:press", held });
  };

  useEffect(() => {
    const release = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      setHolding(false);
      // After the door opened there is nothing to release (the server ended the sequence).
      if (phaseRef.current === "FINAL_SEQUENCE") void send({ type: "final:press", held: false });
    };
    const onHide = () => document.hidden && release();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      release();
    };
  }, [send]);

  /** Spread onto the hold button. */
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setHold(true);
    },
    onPointerUp: () => setHold(false),
    onPointerCancel: () => setHold(false),
    onLostPointerCapture: () => setHold(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  return { holding, handlers };
}
