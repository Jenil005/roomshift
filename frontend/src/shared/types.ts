// SHARED CONTRACT. This file should live in /shared and be agreed with the
// backend and AR teammates before anyone builds against it. Changes here need
// integration awareness (see team write-up).

export type Phase =
  | "LOBBY"
  | "READY"
  | "INTRO"
  | "PUZZLE_1"
  | "PUZZLE_1_COMPLETE"
  | "PUZZLE_2"
  | "PUZZLE_2_COMPLETE"
  | "FINAL_OVERRIDE"
  | "COMPLETE"
  | "FAILED"; // proposed addition: timer ran out (defeat screen)

export type RoleId = "ARCHIVIST" | "COURIER" | "TIMEKEEPER";
export type ObjectId = "BOOK" | "CUP" | "KEYS";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  role?: RoleId;
  introAcked?: boolean;
}

/** Private to one player. The server sends each player ONLY their own briefing. */
export interface RoleBriefing {
  role: RoleId;
  title: string;
  puzzle1Clue: string;
  puzzle2Brief: string;
  puzzle2Target?: ObjectId; // set if this player must scan an object in Puzzle 2
  overrideFragments: { position: number; digit: string }[]; // position is 1-based
}

/** Public state every player sees. */
export interface GameState {
  roomCode: string;
  phase: Phase;
  players: Player[];
  startedAt: number | null;   // ms epoch (server clock)
  deadline: number | null;    // ms epoch (server clock); life bar drains toward this
  completedAt: number | null;
  power: number;              // 0-100, mission progress
  puzzle2Scans: Record<string, number>; // playerId -> ms epoch of their scan
  finalCodeAccepted: boolean;
  finalHolding: string[];     // playerIds currently holding ACTIVATE
  lastError: string | null;   // short message for the most recent rejected action
}

/** Owned by the AR/vision teammate (ar/**). The UI never inspects video itself. */
export type PhysicalPuzzleResult = {
  solved: boolean;
  detectedIds: string[];
  order?: string[];
};

export type ClientAction =
  | { type: "room:create"; name: string }
  | { type: "room:join"; code: string; name: string }
  | { type: "room:leave" }
  | { type: "player:ready"; ready: boolean }
  | { type: "game:start" }
  | { type: "intro:ack" } // proposed addition: player has read their role
  | { type: "puzzle:submit"; puzzle: 1; result: PhysicalPuzzleResult }
  | { type: "puzzle:submit"; puzzle: 2; target: ObjectId }
  | { type: "final:code"; code: string }
  | { type: "final:activate"; holding: boolean }
  | { type: "game:reset" };

/** What the UI renders from: public state + who I am + my private briefing. */
export interface ClientSnapshot {
  state: GameState | null; // null = not in a room yet
  selfId: string | null;
  briefing: RoleBriefing | null;
  serverTimeOffset: number; // serverNow - Date.now(); keeps every phone's timer in sync
}
