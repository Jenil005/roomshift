import { MODULES, MODULE_LABEL } from "@shared/puzzles/commsBoot";
import type { Room } from "@shared/types";
import type { FacilityState } from "../../../ar/facility/scene";

/** Server state -> what the facility shows. Nothing here is decided locally. */
export function facilityStateFrom(room: Room): FacilityState {
  return {
    ...room.systems,
    phase: room.phase,
    draft: room.puzzle2?.draft ?? [],
    modules: MODULES.map((id) => ({ id, label: MODULE_LABEL[id] })),
    holding: room.final?.holding.length ?? 0,
    players: room.players.filter((p) => p.connected).length,
  };
}
