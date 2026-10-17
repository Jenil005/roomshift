import type { OBJECT_IDS, ROLE_IDS } from "../constants";

export type ObjectId = (typeof OBJECT_IDS)[number];
export type RoleId = (typeof ROLE_IDS)[number];

// Backend is authoritative: clients request, the server decides and advances.
export type GamePhase =
  | "LOBBY"
  | "READY"
  | "INTRO"
  | "PUZZLE_1"
  | "PUZZLE_1_COMPLETE"
  | "PUZZLE_2"
  | "PUZZLE_2_COMPLETE"
  | "FINAL_SEQUENCE"
  | "COMPLETE";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  role?: RoleId;
}

export interface Room {
  code: string;
  phase: GamePhase;
  players: Player[];
  createdAt: number;
  // Narration is flavor only. Gemini never decides game state; fallback strings always exist.
  narration?: string;
}

// Private per-player clue (server-side data; never broadcast to other players).
export interface PrivateClue {
  playerId: string;
  role: RoleId;
  text: string;
}

// Puzzle 1 (physical): scan objects in the required order or combination.
export interface PuzzleSubmission {
  roomCode: string;
  playerId: string;
  puzzle: 1 | 2;
  scanned?: ObjectId[]; // physical scan results
  manualCode?: string; // manual entry fallback if camera fails
}
