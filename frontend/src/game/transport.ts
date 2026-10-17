import type { GameRequest, GameResult, RoomData } from "@shared/events";
import type { ClientMode } from "./GameClient";

/** A failed reply; `network` marks requests that never got a server answer. */
export type TransportResult<T = unknown> = GameResult<T> & { network?: boolean };

/** How the client reaches a game server: the real HTTP API, or the in-tab mock engine. */
export interface Transport {
  readonly mode: ClientMode;
  post<T = unknown>(body: GameRequest): Promise<TransportResult<T>>;
  /** Public room view (no token). */
  view(code: string): Promise<TransportResult<RoomData>>;
  dispose?(): void;
}

const REQUEST_TIMEOUT_MS = 10_000;

const networkError = (message: string): TransportResult<never> => ({
  ok: false,
  code: "server_error",
  message,
  network: true,
});

async function call<T>(url: string, init: RequestInit): Promise<TransportResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    return networkError("Network error. Check your connection.");
  }
  try {
    return (await res.json()) as GameResult<T>;
  } catch {
    // A proxy or an outage page answered instead of the game API.
    return networkError(`The game server sent an unexpected reply (HTTP ${res.status}).`);
  }
}

/** POST /api/game and GET /api/game/room/:code on `origin` (CORS is open on /api/*). */
export function httpTransport(origin: string): Transport {
  const base = origin.replace(/\/$/, "");
  return {
    mode: "live",
    post: (body) =>
      call(`${base}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    view: (code) => call(`${base}/api/game/room/${encodeURIComponent(code)}`, { method: "GET" }),
  };
}
