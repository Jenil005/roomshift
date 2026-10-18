import type { ClientEvent, GameErrorCode, GameResult } from "@shared/events";
import type { PrivateClue, Room } from "@shared/types";

/**
 * The only thing the UI knows about networking. The UI renders the server's public `Room`
 * plus this player's own private clue, and sends canonical `ClientEvent`s (shared/events).
 * Clients never decide outcomes: every phase, role and puzzle result comes from the server.
 */
export interface GameClient {
  getSnapshot(): ClientSnapshot;
  subscribe(listener: () => void): () => void;
  /** Sends one request. Resolves with the server's result; never throws. */
  send(event: ClientEvent): Promise<GameResult>;
  clearError(): void;
  /** Fetches the public room view now (e.g. right before editing shared state). */
  refresh(): Promise<Room | null>;
  /** Starts background work (resume, polling, heartbeat). Safe to call again after stop(). */
  start(): void;
  stop(): void;
}

/** "live" = the real DeepSpace backend. "mock" = the real game engine running in this tab with bots. */
export type ClientMode = "live" | "mock";

/** idle = not in a room. reconnecting = recent requests failed, retrying. offline = giving up until the network returns. */
export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

export interface ClientError {
  code: GameErrorCode | "network";
  message: string;
  action: ClientEvent["type"];
  retryAt?: number; // local epoch ms; set for cooldown / rate_limited
  at: number;
}

/** Result of the latest puzzle:submit. A wrong answer is ok:true with solved:false. */
export interface SubmitOutcome {
  puzzle: 1 | 2;
  solved: boolean;
  reason?: string;
  retryAt?: number; // local epoch ms
  at: number;
}

export interface ClientSnapshot {
  mode: ClientMode;
  room: Room | null; // null = not in a room
  selfId: string | null;
  clue: PrivateClue | null; // this player's own clue only, from room:me
  connection: ConnectionStatus;
  resuming: boolean; // restoring a stored seat after a reload
  pending: ClientEvent["type"] | null; // user action awaiting its reply
  lastError: ClientError | null;
  lastSubmit: SubmitOutcome | null;
  serverTimeOffset: number; // estimate of serverNow - Date.now()
}
