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

// Puzzle 1 manual report (accessibility / no-camera fallback): the sequence the players
// say they used. Recorded as verifiedBy "manual". Camera scans use puzzle1:scan instead.
export interface PhysicalEvidence {
  source: "manual";
  order: string[];
}

// One object scan sent with puzzle1:scan. `source` is how this phone saw it: on-device AI
// (with the detector's score) or a printed QR tag. Client evidence is gameplay input; the
// server cannot authenticate a detection it did not observe.
export interface ObjectScanInput {
  object: ObjectId;
  source: "ai" | "qr";
  confidence?: number; // required for "ai", 0..1
}

// An accepted scan in the current puzzle 1 attempt.
export interface ObjectScan {
  object: ObjectId;
  source: "ai" | "qr";
  by: string; // player id
  at: number; // server epoch ms
}

// Puzzle 1 scan progress, shared by the team. Objects appear once each, in the order the
// server accepted them. Cleared on an out-of-sequence scan, puzzle1:restart or game:reset.
export interface Puzzle1PublicState {
  scanned: ObjectScan[];
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
  narrationSource?: "gemini" | "fallback"; // which produced the current narration line
  hostId: string;
  missionId: string;
  phaseStartedAt: number; // server epoch ms when the current phase began
  // Server epoch ms when the host proceeded from INTRO to PUZZLE_1; the mission countdown
  // runs MISSION_DURATION_MS from here. Absent in LOBBY/READY/INTRO; cleared by game:reset.
  missionStartedAt?: number;
  systems: SystemsState;
  puzzles: { 1: PuzzleProgress; 2: PuzzleProgress };
  version: number; // increments on every state change
  events: RoomEventEntry[]; // most recent server events, oldest first (bounded)
  puzzle1?: Puzzle1PublicState; // present from PUZZLE_1 on
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

// Puzzle 1 (physical): camera scans go one object at a time through puzzle1:scan; this
// submission carries only the manual fallback. Puzzle 2 (digital): the comms boot order.
export interface PuzzleSubmission {
  roomCode: string; // ignored by the server: the room comes from the request's code + playerToken
  playerId: string; // ignored by the server: identity comes from playerToken
  puzzle: 1 | 2;
  manualCode?: string; // puzzle 1 manual fallback: initials in sequence, e.g. "BCK"
  physical?: PhysicalEvidence; // puzzle 1 manual fallback: the AR module's manual report
  order?: string[]; // puzzle 2 module ids, see shared/puzzles/commsBoot.ts
}
