import type { GamePhase, PrivateClue, PuzzleSubmission, RoleId, Room } from "../types";

// Client -> server requests.
// Transport: POST /api/game with JSON body `GameRequest`. Every request except room:create
// and a first room:join must carry `code` and the `playerToken` returned by create/join.
export type ClientEvent =
  | { type: "room:create"; playerName: string; demo?: boolean } // demo: short mission clock
  | { type: "room:join"; code: string; playerName: string } // add playerToken to rejoin
  | { type: "room:leave" }
  | { type: "room:ready"; ready: boolean }
  | { type: "game:start" } // host only
  | { type: "puzzle:submit"; submission: PuzzleSubmission }
  | { type: "player:heartbeat" } // every HEARTBEAT_INTERVAL_MS while the page is open
  | { type: "room:me" } // returns the caller's PrivateClue
  | { type: "intro:skip" } // host only, INTRO -> PUZZLE_1 early
  | { type: "puzzle2:draft"; order: string[] }
  | { type: "final:press"; held: boolean }
  | { type: "final:force" } // host only, after FINAL_FORCE_AFTER_MS in FINAL_SEQUENCE
  | { type: "game:reset" } // host only: back to LOBBY with the same players (demo replay)
  | { type: "dev:command"; command: DevCommand }; // host only: testing shortcuts, see below

// Testing shortcuts for the room host. Every use is recorded in Room.events as `dev:used`.
export type DevCommand =
  | { kind: "timer:pause" }
  | { kind: "timer:resume" }
  | { kind: "timer:set"; remainingMs: number } // e.g. 10_000 for "10 seconds left"
  | { kind: "fail" } // instant FAILED
  | { kind: "win" } // instant COMPLETE
  | { kind: "clear" } // finish the current stage as if the team solved it
  | { kind: "jump"; phase: DevJumpPhase }; // from LOBBY too (needs 2+ players, skips ready checks)

export const DEV_JUMP_PHASES = ["INTRO", "PUZZLE_1", "PUZZLE_2", "FINAL_SEQUENCE", "COMPLETE", "FAILED"] as const;
export type DevJumpPhase = (typeof DEV_JUMP_PHASES)[number];

export type GameRequest = ClientEvent & { code?: string; playerToken?: string };

export type GameErrorCode =
  | "bad_request"
  | "room_not_found"
  | "room_full"
  | "game_started"
  | "name_taken"
  | "not_in_room"
  | "not_host"
  | "wrong_phase"
  | "not_enough_players"
  | "cooldown"
  | "rate_limited" // too many requests; wait retryAfterMs
  | "not_implemented"
  | "server_error";

// Response body of POST /api/game.
export type GameResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: GameErrorCode; message: string; retryAfterMs?: number };

// `data` per request type on success.
export interface JoinData {
  code: string;
  playerId: string;
  playerToken: string; // store it (localStorage); it is the only proof of identity
  room: Room;
}
export type CreateData = JoinData;
export interface MeData {
  playerId: string;
  clue: PrivateClue | null; // null until roles are assigned at game:start
  room: Room;
}
export interface RoomData {
  room: Room;
}
// puzzle:submit. A wrong answer is still ok:true (the request was valid); see `solved`.
export interface SubmitData {
  solved: boolean;
  reason?: string; // short, safe to show; no hint about how close the guess was
  retryAfterMs?: number; // puzzle 2 cooldown before the next submit is accepted
  room: Room;
}

// Server -> client events. They are not pushed on a socket: they appear in Room.events
// (with seq/at) on the live `rs_rooms` record (names may change to fit DeepSpace patterns)
export type ServerEvent =
  | { type: "game:state"; phase: GamePhase }
  | { type: "player:role"; playerId: string; role: RoleId }
  | { type: "puzzle:verified"; puzzle: 1 | 2; verifiedBy?: "camera" | "manual" }
  | { type: "puzzle:failed"; puzzle: 1 | 2; reason: string; retryAfterMs?: number }
  | { type: "game:advance"; to: GamePhase }
  | { type: "game:complete" }
  | { type: "game:failed" } // mission clock ran out
  | { type: "dev:used"; playerId: string; kind: DevCommand["kind"] }
  | { type: "puzzle2:draftUpdated"; order: string[] }
  | { type: "puzzle2:hint"; text: string }
  // P1/P2 stretch, optional
  | { type: "missionrelay:send"; playerId: string }
  | { type: "missionrelay:delivered"; playerId: string }
  | { type: "realitysync:trigger" };
