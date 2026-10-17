import { useCallback } from "react";
import type { ModuleId } from "@shared/puzzles/commsBoot";
import { useGame } from "../game/useGame";

/**
 * Shared Comms Boot draft. puzzle2:draft replaces the whole order on the server, so every
 * edit starts from the latest server copy (another phone may have changed it since our last
 * poll). A remaining race window of one round trip is possible; the draft is last-writer-wins.
 */
export function useBootDraft() {
  const { room, send, refresh, pending } = useGame();
  const draft = (room?.puzzle2?.draft ?? []) as ModuleId[];
  const toggle = useCallback(
    async (m: ModuleId) => {
      const latest = ((await refresh())?.puzzle2?.draft ?? []) as ModuleId[];
      await send({ type: "puzzle2:draft", order: latest.includes(m) ? latest.filter((x) => x !== m) : [...latest, m] });
    },
    [refresh, send],
  );
  const clear = useCallback(() => void send({ type: "puzzle2:draft", order: [] }), [send]);
  return { draft, toggle, clear, busy: pending === "puzzle2:draft" || pending === "puzzle:submit" };
}
