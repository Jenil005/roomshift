// Puzzle Master content. Every puzzle is designed so no single player can solve it alone.
// The real server owns the solutions; the mock client reuses these to play the server locally.
import type { ObjectId, RoleId } from "../shared/types";

export const PUZZLE_1_SOLUTION: ObjectId[] = ["BOOK", "CUP", "KEYS"];

export const OBJECT_LABEL: Record<ObjectId, string> = { BOOK: "Book", CUP: "Cup", KEYS: "Keys" };

// Roles are flavour only: the server deals clues round-robin, not by role.
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
  scout: "Sweep the room and report what the others can't see.",
};

/** Power bar level per restored system. Both clients use these so live and mock look the same. */
export const POWER = { start: 15, breaker: 75, terminal: 100, door: 100 };

/**
 * Puzzle 1 logic: "knowledge" = book, "containment" = cup, "access" = keys.
 * The first three lines pin down BOOK, CUP, KEYS; the fourth is only dealt to a 4th player.
 * Same lines as backend/src/game/puzzle1.ts.
 */
const PUZZLE_1_CLUES = [
  "Knowledge comes before containment.",
  "Access comes last.",
  "Containment is between the other two.",
  "Knowledge comes first.",
];

/** Deal puzzle 1 clues round-robin, the way the server does. */
export function dealPuzzle1Clues(playerIds: string[]): Record<string, string[]> {
  const pool = playerIds.length >= 4 ? PUZZLE_1_CLUES : PUZZLE_1_CLUES.slice(0, 3);
  const dealt: Record<string, string[]> = Object.fromEntries(playerIds.map((id) => [id, []]));
  pool.forEach((clue, i) => dealt[playerIds[i % playerIds.length]].push(clue));
  return dealt;
}

/** Static narration. The server's Gemini narration replaces these when present. */
export const NARRATION = {
  intro: "Facility 04 has lost main power. Lockdown engaged. Restore the grid before the reserve runs dry.",
  puzzle1Complete: "Sequence accepted. Auxiliary power rising.",
  puzzle2Complete: "Comms online. Blast door controls unlocked.",
  complete: "Reality successfully shifted.",
  failed: "The reserve ran dry. Lockdown holds.",
};
