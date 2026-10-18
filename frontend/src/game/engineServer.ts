// In-process stand-in for POST /api/game and GET /api/game/room/:code, running the real
// backend state machine (backend/src/game/engine.ts). Used by the local demo and by tests.
// Mirrors backend/src/server/game-routes.ts: mints tokens, maps requests to engine commands,
// and never trusts client identity fields. Tokens are used as their own "hash" here.
import { ROOM_CODE_ALPHABET } from "@shared/constants";
import type { GameRequest, GameResult, JoinData, RoomData } from "@shared/events";
import { reduce, type EngineCommand, type GameState, type JoinResultData } from "../../../backend/src/game/engine";
import type { TransportResult } from "./transport";

export const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
const randomCode = () =>
  Array.from({ length: 4 }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join("");

export interface EngineServer {
  post<T = unknown>(body: GameRequest): TransportResult<T>;
  view(code: string): TransportResult<RoomData>;
  /** Runs an engine command directly (bots, timers). */
  run(command: EngineCommand): GameResult;
  tick(): void;
  readonly state: GameState | null;
}

export function engineServer(now: () => number = Date.now, random: () => number = Math.random): EngineServer {
  let state: GameState | null = null;

  function run(command: EngineCommand): GameResult {
    const out = reduce(state, command, { now: now(), random });
    state = out.state;
    return out.result;
  }

  function withToken(result: GameResult, playerToken: string): GameResult<JoinData> {
    if (!result.ok) return result;
    const data: Partial<JoinResultData> = { ...(result.data as JoinResultData) };
    delete data.rejoined;
    return { ok: true, data: { ...(data as Omit<JoinResultData, "rejoined">), playerToken } };
  }

  function post<T>(body: GameRequest): TransportResult<T> {
    if (body.type === "room:create") {
      const token = randomId("tok");
      const result = run({ type: "room:create", code: randomCode(), playerId: randomId("p"), playerName: body.playerName, tokenHash: token });
      return withToken(result, token) as TransportResult<T>;
    }
    const code = (body.code ?? "").trim().toUpperCase();
    if (!state || state.code !== code) return { ok: false, code: "room_not_found", message: "No room with that code" };
    if (body.type === "room:join") {
      const fresh = randomId("tok");
      const result = run({ type: "room:join", playerId: randomId("p"), playerName: body.playerName, tokenHash: fresh, rejoinTokenHash: body.playerToken });
      const rejoined = result.ok && (result.data as JoinResultData).rejoined;
      return withToken(result, rejoined ? body.playerToken! : fresh) as TransportResult<T>;
    }
    const tokenHash = body.playerToken ?? "";
    let command: EngineCommand;
    switch (body.type) {
      case "room:ready":
        command = { type: body.type, tokenHash, ready: body.ready };
        break;
      case "puzzle:submit": {
        const { puzzle, physical, scanned, manualCode, order } = body.submission;
        command = { type: body.type, tokenHash, puzzle, physical, scanned, manualCode, order };
        break;
      }
      case "puzzle2:draft":
        command = { type: body.type, tokenHash, order: body.order };
        break;
      case "final:press":
        command = { type: body.type, tokenHash, held: body.held };
        break;
      default:
        command = { type: body.type, tokenHash };
    }
    return run(command) as TransportResult<T>;
  }

  return {
    post,
    view(code) {
      if (!state || state.code !== code.toUpperCase()) return { ok: false, code: "room_not_found", message: "No room with that code" };
      return run({ type: "room:view" }) as GameResult<RoomData>;
    },
    run,
    tick() {
      if (state) run({ type: "tick" });
    },
    get state() {
      return state;
    },
  };
}
