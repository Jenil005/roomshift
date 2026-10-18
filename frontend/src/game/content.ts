// Display text only. Solutions and clues live on the server; the UI shows what room:me returns.
import type { ModuleId } from "@shared/puzzles/commsBoot";
import type { ObjectId, RoleId, Room, SystemsState } from "@shared/types";

export const OBJECT_LABEL: Record<ObjectId, string> = { book: "Book", cup: "Cup", keyboard: "Keyboard" };

export const ROLE_TITLE: Record<RoleId, string> = {
  engineer: "Field Engineer",
  analyst: "Signal Analyst",
  operator: "Relay Operator",
  scout: "Recon Scout",
};
export const ROLE_DESCRIPTION: Record<RoleId, string> = {
  engineer: "Rebuild the physical power circuit.",
  analyst: "Decode encrypted clues hidden throughout the environment.",
  operator: "Trace unstable energy signals and synchronize the final override.",
  scout: "Watch the room and keep the team's notes straight.",
};

export const MODULE_HINT: Record<ModuleId, string> = {
  auth: "Identity gate",
  network: "Signal mesh",
  database: "Archive core",
  uplink: "Orbital relay",
};

/** Static lines used when the server sent no narration (the server always has a fallback too). */
export const NARRATION = {
  intro: "Facility 04 has lost main power. Lockdown engaged. Restore the grid together.",
  puzzle1Complete: "Breaker engaged. Emergency power is flowing.",
  puzzle2Complete: "Comms online. The blast door controller is responding.",
  complete: "Reality successfully shifted.",
};

/**
 * Power shown on screen, derived only from the server's systems flags (it is not a server
 * field): reserve 15%, breaker +45, terminal +25, door +15.
 */
export function powerPercent(systems: SystemsState): number {
  return 15 + (systems.breaker ? 45 : 0) + (systems.terminal ? 25 : 0) + (systems.door ? 15 : 0);
}

export function narrationFor(room: Room, fallback: string): string {
  return room.narration || fallback;
}
