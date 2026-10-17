import type { GamePhase, PuzzleSubmission, RoleId } from "../types";

// Client -> server requests
export type ClientEvent =
  | { type: "room:create"; playerName: string }
  | { type: "room:join"; code: string; playerName: string }
  | { type: "room:leave" }
  | { type: "room:ready"; ready: boolean }
  | { type: "game:start" } // host only
  | { type: "puzzle:submit"; submission: PuzzleSubmission };

// Server -> client broadcasts (names may change to fit DeepSpace patterns)
export type ServerEvent =
  | { type: "game:state"; phase: GamePhase }
  | { type: "player:role"; playerId: string; role: RoleId }
  | { type: "puzzle:verified"; puzzle: 1 | 2 }
  | { type: "puzzle:failed"; puzzle: 1 | 2; reason: string }
  | { type: "game:advance"; to: GamePhase }
  | { type: "game:complete" }
  // P1/P2 stretch, optional
  | { type: "missionrelay:send"; playerId: string }
  | { type: "missionrelay:delivered"; playerId: string }
  | { type: "realitysync:trigger" };
