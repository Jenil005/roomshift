import type { ClientEvent, GameErrorCode, GameResult, ScanData } from "@shared/events";
import type { ObjectId, ObjectScanInput, PrivateClue, Room } from "@shared/types";

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
  /**
   * Puzzle 1: records one recognized object. Queued and sent once (puzzle1:scan), retried
   * after a network failure; ignored if the server already has it or it is already queued.
   */
  scanObject(scan: ObjectScanInput): void;
  /** Puzzle 1: drops queued scans and asks the server to clear the team's progress. */
  restartScans(): Promise<GameResult>;
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

/** Result of the latest puzzle1:scan this phone sent ("error": refused, see `reason`). */
export interface ScanOutcome {
  object: ObjectId;
  status: ScanData["status"] | "error";
  reason?: string;
  retryAt?: number; // local epoch ms
  at: number;
}

/** Puzzle 1 scans recognized on this phone that the server has not answered yet. */
export interface ScanQueueState {
  pending: ObjectId[]; // in recognition order
  last: ScanOutcome | null;
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
  scans: ScanQueueState;
  serverTimeOffset: number; // estimate of serverNow - Date.now()
}
