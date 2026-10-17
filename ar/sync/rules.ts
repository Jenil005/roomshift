import { SYSTEM_ORDER, type RoomState, type SystemId } from "../types";

// DEMO-ONLY rule so the AR room is testable alone. The real puzzle gating lives in the
// authoritative DeepSpace backend; the AR layer only renders state it is given.
export function tryRestore(state: RoomState, id: SystemId): { ok: true; state: RoomState } | { ok: false; reason: string } {
  if (state.systems[id]) return { ok: false, reason: "Already online." };
  const idx = SYSTEM_ORDER.indexOf(id);
  const blocker = SYSTEM_ORDER.slice(0, idx).find((s) => !state.systems[s]);
  if (blocker) return { ok: false, reason: `Restore ${blocker} first.` };
  return { ok: true, state: { version: state.version + 1, systems: { ...state.systems, [id]: true } } };
}
