// The UI's view model. The wire contract lives in /shared (imported as @shared) and is owned
// with the backend; deepspaceClient maps the server's Room onto these types, so screens never
// see the wire format. Ids and phases come straight from the shared contract.
import type { GamePhase, MissionTimer, RoleId as SharedRoleId } from "@shared/types";
import type { DevCommand } from "@shared/events";
import type { ModuleId } from "@shared/puzzles/commsBoot";

export type { DevCommand, MissionTimer, ModuleId };

/** The server's phases (FAILED = the mission clock ran out). */
export type Phase = GamePhase;

export type RoleId = SharedRoleId;
/** Uppercase to match the AR module's marker ids; the server matches ids case-insensitively. */
export type ObjectId = "BOOK" | "CUP" | "KEYS";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  role?: RoleId;
}

/** Private to one player. The server sends each player ONLY their own clues. */
export interface RoleBriefing {
  role: RoleId;
  title: string;
  clues: string[]; // clue lines for the current puzzle (puzzle 1 until PUZZLE_2, then puzzle 2)
}

/** Public state every player sees. All times are ms epoch on the server clock. */
export interface GameState {
  roomCode: string;
  phase: Phase;
  players: Player[];
  phaseStartedAt: number;
  startedAt: number | null;
  timer: MissionTimer | null; // mission clock from game:start, drawn as the LIFE bar
  completedAt: number | null;
  power: number; // 0-100, mission progress
  narration: string | null; // server narration line for this phase, if any
  retryAt: number | null; // current puzzle rejects submits until then (cooldown)
  puzzle2Draft: ModuleId[]; // shared boot order everyone edits
  puzzle2Hints: string[]; // public hints released after repeated wrong tries
  finalHolding: string[]; // playerIds currently holding
  finalForceAt: number | null; // host may force the door after this
  lastError: string | null; // short message for the most recent rejected action
}

/** Owned by the AR/vision teammate (ar/**). The UI never inspects video itself. */
export type PhysicalPuzzleResult = {
  solved: boolean;
  detectedIds: string[];
  order?: string[];
  // Camera evidence the server verifies itself (it ignores `solved` and `order` for camera).
  source?: "camera" | "manual";
  markers?: { id: string; center: { x: number; y: number } }[];
  heldForMs?: number;
};

export type ClientAction =
  | { type: "room:create"; name: string }
  | { type: "room:join"; code: string; name: string }
  | { type: "room:leave" }
  | { type: "player:ready"; ready: boolean }
  | { type: "game:start" }
  | { type: "intro:skip" } // host only
  | { type: "puzzle:submit"; puzzle: 1; result: PhysicalPuzzleResult }
  | { type: "puzzle:submit"; puzzle: 2; order: ModuleId[] }
  | { type: "puzzle2:draft"; order: ModuleId[] }
  | { type: "final:activate"; holding: boolean }
  | { type: "final:force" } // host only, after finalForceAt
  | { type: "game:reset" } // host only
  | { type: "dev"; command: DevCommand }; // host only, from the ?dev panel

/** What the UI renders from: public state + who I am + my private briefing. */
export interface ClientSnapshot {
  state: GameState | null; // null = not in a room yet
  selfId: string | null;
  briefing: RoleBriefing | null;
  serverTimeOffset: number; // serverNow - Date.now(); keeps every phone's timers in sync
  connecting?: boolean; // true while resuming a saved session on page load
  homeError?: string | null; // why create/join/resume failed (shown on the home screen)
}
