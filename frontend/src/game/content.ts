// Puzzle Master content. Every puzzle is designed so no single player can solve it alone.
import type { ObjectId, RoleBriefing, RoleId } from "../shared/types";

export const PUZZLE_1_SOLUTION: ObjectId[] = ["BOOK", "CUP", "KEYS"];
export const FINAL_CODE = "742";
export const PUZZLE_2_WINDOW_MS = 5000;

export const OBJECT_LABEL: Record<ObjectId, string> = { BOOK: "Book", CUP: "Cup", KEYS: "Keys" };

const ROLE_TITLE: Record<RoleId, string> = {
  ARCHIVIST: "Field Engineer",
  COURIER: "Signal Analyst",
  TIMEKEEPER: "Relay Operator",
};
export const ROLE_DESCRIPTION: Record<RoleId, string> = {
  ARCHIVIST: "Rebuild the physical power circuit.",
  COURIER: "Decode encrypted clues hidden throughout the environment.",
  TIMEKEEPER: "Trace unstable energy signals and synchronize the final override.",
};

/**
 * Puzzle 1 logic: "knowledge" = book, "containment" = cup, "access" = keys.
 * Archivist + Courier clues alone already force BOOK, CUP, KEYS, so 2 players works.
 */
export function buildBriefing(role: RoleId, playerCount: number): RoleBriefing {
  const twoPlayer = playerCount < 3;
  switch (role) {
    case "ARCHIVIST":
      return {
        role,
        title: ROLE_TITLE[role],
        puzzle1Clue: "Knowledge comes before containment.",
        puzzle2Brief: twoPlayer
          ? "Scan the book. Your partner must scan the keys within 5 seconds of you. Count down together."
          : "When the Timekeeper says go, scan the book.",
        puzzle2Target: "BOOK",
        overrideFragments: twoPlayer
          ? [{ position: 1, digit: "7" }, { position: 3, digit: "2" }]
          : [{ position: 1, digit: "7" }],
      };
    case "COURIER":
      return {
        role,
        title: ROLE_TITLE[role],
        puzzle1Clue: "Access comes last.",
        puzzle2Brief: twoPlayer
          ? "Scan the keys. Your partner must scan the book within 5 seconds of you. Count down together."
          : "When the Timekeeper says go, scan the keys.",
        puzzle2Target: "KEYS",
        overrideFragments: [{ position: 2, digit: "4" }],
      };
    case "TIMEKEEPER":
      return {
        role,
        title: ROLE_TITLE[role],
        puzzle1Clue: "Containment sits between the other two.",
        puzzle2Brief:
          "The book and the keys must be scanned within 5 seconds of each other. Count down out loud: 3, 2, 1, go.",
        overrideFragments: [{ position: 3, digit: "2" }],
      };
  }
}

/** Static narration. Gemini can replace these later; these are the fallback. */
export const NARRATION = {
  intro: "Facility 04 has lost main power. Lockdown engaged. Restore the grid before the reserve runs dry.",
  puzzle1Complete: "Sequence accepted. Auxiliary power rising.",
  puzzle2Complete: "Relays synchronized. Override panel unlocked.",
  complete: "Reality successfully shifted.",
  failed: "The reserve ran dry. Lockdown holds.",
};
