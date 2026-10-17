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
  lastSeen?: number; // server epoch ms of the last request from this player
}

// Online flags for the AR view, driven only by the server's state machine.
export interface SystemsState {
  breaker: boolean; // set by puzzle 1
  terminal: boolean; // set by puzzle 2
  door: boolean; // set by the final sequence
}

export interface PuzzleProgress {
  solved: boolean;
  attempts: number;
  lastFailure?: string;
  retryAt?: number; // server epoch ms before which a new submit is rejected
  verifiedBy?: "camera" | "manual"; // puzzle 1: how the solve was evidenced
}

// Puzzle 1 evidence: the AR module's PhysicalPuzzleResult can be sent as-is (extra fields
// such as `solved` and `detectedIds` are ignored). For source "camera" the server derives
// the order from the marker centers itself and ignores `order`.
export interface PhysicalEvidence {
  source: "camera" | "manual";
  order?: string[]; // left to right; used for "manual"
  markers?: { id: string; center: { x: number; y: number } }[]; // normalized image coordinates
  heldForMs?: number;
}

// Public room state. The backend mirrors this into the DeepSpace `rs_rooms` collection
// (recordId = room code, field `view`), so every phone receives it live via useQuery.
export interface Room {
  code: string;
  phase: GamePhase;
  players: Player[];
  createdAt: number;
  // Narration is flavor only. Gemini never decides game state; fallback strings always exist.
  narration?: string;
  hostId: string;
  missionId: string;
  phaseStartedAt: number; // server epoch ms when the current phase began
  systems: SystemsState;
  puzzles: { 1: PuzzleProgress; 2: PuzzleProgress };
  version: number; // increments on every state change
  events: RoomEventEntry[]; // most recent server events, oldest first (bounded)
  puzzle2?: Puzzle2PublicState; // present from PUZZLE_2 on
  final?: FinalPublicState; // present during FINAL_SEQUENCE
}

export interface Puzzle2PublicState {
  draft: string[]; // shared boot order being built, module ids (shared/puzzles/commsBoot.ts)
  hints: string[]; // public hints released after repeated wrong attempts
}

export interface FinalPublicState {
  holding: string[]; // ids of players currently holding
  forceAvailableAt: number; // server epoch ms after which the host may send final:force
}

// Server events are recorded on the room so clients can react to them (toasts, sounds).
// `seq` is strictly increasing per room; a client remembers the last seq it handled.
export type RoomEventEntry = import("../events").ServerEvent & { seq: number; at: number };

// Private per-player clue (server-side data; never broadcast to other players).
// Fetched only by its owner through the room:me request.
export interface PrivateClue {
  playerId: string;
  role: RoleId;
  text: string; // all clues joined with spaces (kept for older consumers)
  clues: string[];
}

// Puzzle 1 (physical): scan objects in the required order or combination.
// Puzzle 2 (digital): submit the boot order of the comms modules.
export interface PuzzleSubmission {
  roomCode: string; // ignored by the server: the room comes from the request's code + playerToken
  playerId: string; // ignored by the server: identity comes from playerToken
  puzzle: 1 | 2;
  scanned?: ObjectId[]; // physical scan results
  manualCode?: string; // manual entry fallback if camera fails
  physical?: PhysicalEvidence; // puzzle 1: preferred, the AR module's result
  order?: string[]; // puzzle 2 module ids, see shared/puzzles/commsBoot.ts
}
