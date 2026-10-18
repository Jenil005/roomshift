import { describe, expect, it } from "vitest";
import { PHASE_COMPLETE_HOLD_MS, PUZZLE1_HOLD_MS } from "@shared/constants";
import type { GameRequest } from "@shared/events";
import { createGameClient, SESSION_KEY } from "./client";
import { engineServer, type EngineServer } from "./engineServer";
import type { Transport, TransportResult } from "./transport";

const flush = () => new Promise((r) => setTimeout(r, 0));

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

/** Fake network in front of the real engine. `down` simulates a dead connection. */
function net(server: EngineServer) {
  const log: GameRequest[] = [];
  const t: { down: boolean; log: GameRequest[]; transport: Transport } = {
    down: false,
    log,
    transport: {
      mode: "live",
      post: async <T,>(body: GameRequest): Promise<TransportResult<T>> => {
        log.push(body);
        if (t.down) return { ok: false, code: "server_error", message: "Network error", network: true };
        return server.post<T>(body);
      },
      view: async (code: string) => (t.down ? { ok: false, code: "server_error", message: "Network error", network: true } : server.view(code)),
    } as Transport,
  };
  return t;
}

function setup() {
  let clock = 1_000_000;
  const server = engineServer(() => clock);
  const n = net(server);
  const make = (storage = memoryStorage()) => {
    // Background loops effectively disabled; tests drive requests explicitly.
    const client = createGameClient(n.transport, { storage, visibility: null, pollMs: 1e9, heartbeatMs: 1e9, now: () => clock });
    return { client, storage };
  };
  return { server, n, make, advance: (ms: number) => (clock += ms) };
}

async function lobbyOfTwo() {
  const s = setup();
  const a = s.make();
  const b = s.make();
  await a.client.send({ type: "room:create", playerName: "Ana" });
  const code = a.client.getSnapshot().room!.code;
  await b.client.send({ type: "room:join", code: code.toLowerCase(), playerName: "Ben" });
  return { ...s, a, b, code };
}

async function startedGame() {
  const g = await lobbyOfTwo();
  await g.a.client.send({ type: "room:ready", ready: true });
  await g.b.client.send({ type: "room:ready", ready: true });
  await g.a.client.send({ type: "game:start" });
  await flush();
  await g.b.client.send({ type: "player:heartbeat" }); // b learns about INTRO, fetches its clue
  await flush();
  return g;
}

describe("game client against the real engine", () => {
  it("create and join give two seats in one room with tokens stored", async () => {
    const { a, b, code } = await lobbyOfTwo();
    const sa = a.client.getSnapshot();
    const sb = b.client.getSnapshot();
    expect(sb.room!.code).toBe(code);
    expect(sb.room!.players.map((p) => p.name)).toEqual(["Ana", "Ben"]);
    expect(sa.selfId).not.toBe(sb.selfId);
    expect(JSON.parse(a.storage.data.get(SESSION_KEY)!).playerToken).not.toBe(JSON.parse(b.storage.data.get(SESSION_KEY)!).playerToken);
  });

  it("uses canonical ready flags and server phases", async () => {
    const { a, b } = await lobbyOfTwo();
    await a.client.send({ type: "room:ready", ready: true });
    expect(a.client.getSnapshot().room!.players[0].isReady).toBe(true);
    expect(a.client.getSnapshot().room!.phase).toBe("LOBBY");
    await b.client.send({ type: "room:ready", ready: true });
    expect(b.client.getSnapshot().room!.phase).toBe("READY");
  });

  it("each player receives only their own private clue", async () => {
    const { a, b, server } = await startedGame();
    const ca = a.client.getSnapshot().clue!;
    const cb = b.client.getSnapshot().clue!;
    expect(ca.playerId).toBe(a.client.getSnapshot().selfId);
    expect(cb.playerId).toBe(b.client.getSnapshot().selfId);
    expect(ca.clues.join()).not.toBe(cb.clues.join());
    const publicView = JSON.stringify(server.view(a.client.getSnapshot().room!.code));
    for (const line of [...ca.clues, ...cb.clues]) expect(publicView).not.toContain(line);
  });

  it("keeps the snapshot object stable until something changes", async () => {
    const { a } = await lobbyOfTwo();
    await a.client.send({ type: "player:heartbeat" }); // catch up with Ben's join
    const first = a.client.getSnapshot();
    await a.client.send({ type: "player:heartbeat" }); // no view change -> same version
    expect(a.client.getSnapshot()).toBe(first);
    await a.client.send({ type: "room:ready", ready: true });
    expect(a.client.getSnapshot()).not.toBe(first);
  });

  it("ignores room views older than the one shown", async () => {
    const { a, n } = await lobbyOfTwo();
    const current = a.client.getSnapshot().room!;
    const stale = { ...current, version: current.version - 1, phase: "COMPLETE" as const };
    n.transport.post = async () => ({ ok: true, data: { room: stale } }) as TransportResult<never>;
    await a.client.send({ type: "player:heartbeat" });
    expect(a.client.getSnapshot().room).toBe(current);
  });

  it("a reload rejoins the same seat without a duplicate player", async () => {
    const g = await startedGame();
    const before = g.a.client.getSnapshot();
    const reloaded = g.make(g.a.storage);
    reloaded.client.start();
    await flush();
    await flush();
    const after = reloaded.client.getSnapshot();
    reloaded.client.stop();
    expect(after.selfId).toBe(before.selfId);
    expect(after.room!.players).toHaveLength(2);
    expect(after.clue?.clues).toEqual(before.clue?.clues);
    expect(after.resuming).toBe(false);
  });

  it("surfaces server errors with retry timing", async () => {
    const g = await startedGame();
    await g.b.client.send({ type: "intro:skip" });
    expect(g.b.client.getSnapshot().lastError).toMatchObject({ code: "not_host", action: "intro:skip" });

    await g.a.client.send({ type: "intro:skip" });
    const manualWrong = { roomCode: "", playerId: "", puzzle: 1 as const, physical: { source: "manual" as const, order: ["cup", "book", "keys"] } };
    await g.a.client.send({ type: "puzzle:submit", submission: manualWrong });
    const outcome = g.a.client.getSnapshot().lastSubmit!;
    expect(outcome).toMatchObject({ puzzle: 1, solved: false, reason: "Wrong order" });
    expect(outcome.retryAt).toBe(g.advance(0) + 1_000); // PUZZLE1_COOLDOWN_MS from the reply, in local time

    await g.a.client.send({ type: "puzzle:submit", submission: manualWrong });
    expect(g.a.client.getSnapshot().lastError).toMatchObject({ code: "cooldown" });
    expect(g.a.client.getSnapshot().lastError!.retryAt).toBeDefined();
  });

  it("reports reconnecting, then offline, and keeps the room on network loss", async () => {
    const { a, n } = await lobbyOfTwo();
    a.client.start();
    n.down = true;
    for (let i = 0; i < 5; i++) await a.client.send({ type: "player:heartbeat" });
    const snap = a.client.getSnapshot();
    a.client.stop();
    expect(snap.connection).toBe("offline");
    expect(snap.room).not.toBeNull();
  });

  it("forgets the seat when the room is gone", async () => {
    const { a, b } = await lobbyOfTwo();
    await a.client.send({ type: "room:leave" });
    expect(a.client.getSnapshot().room).toBeNull();
    expect(a.client.getSnapshot().lastError).toBeNull(); // leaving on purpose is not an error
    await b.client.send({ type: "room:leave" }); // last player: room deleted
    await a.client.send({ type: "room:join", code: b.client.getSnapshot().room?.code ?? "ZZZZ", playerName: "Ana" });
    expect(a.client.getSnapshot().lastError?.code).toBe("room_not_found");
  });

  it("plays a full mission with camera evidence, the shared boot order and a joint hold", async () => {
    const g = await startedGame();
    const { a, b, server } = g;
    await a.client.send({ type: "intro:skip" });
    expect(a.client.getSnapshot().room!.phase).toBe("PUZZLE_1");

    const marker = (id: string, x: number) => ({ id: id.toUpperCase(), center: { x, y: 0.5 } });
    await b.client.send({
      type: "puzzle:submit",
      submission: { roomCode: "", playerId: "", puzzle: 1, physical: { source: "camera", heldForMs: PUZZLE1_HOLD_MS, markers: [marker("keys", 0.8), marker("book", 0.2), marker("cup", 0.5)] } },
    });
    expect(b.client.getSnapshot().lastSubmit?.solved).toBe(true);
    expect(b.client.getSnapshot().room!.systems.breaker).toBe(true);
    expect(b.client.getSnapshot().room!.puzzles[1].verifiedBy).toBe("camera");

    g.advance(PHASE_COMPLETE_HOLD_MS);
    await a.client.send({ type: "player:heartbeat" });
    await b.client.send({ type: "player:heartbeat" });
    await flush();
    expect(a.client.getSnapshot().room!.phase).toBe("PUZZLE_2");
    expect(a.client.getSnapshot().clue!.clues.join()).not.toMatch(/Knowledge|Access|Containment/); // puzzle 2 notes replaced puzzle 1 clues

    const solution = server.state!.puzzle2!.solution;
    for (let i = 1; i <= solution.length; i++) {
      await (i % 2 ? a : b).client.send({ type: "puzzle2:draft", order: solution.slice(0, i) });
    }
    await b.client.send({ type: "player:heartbeat" });
    expect(b.client.getSnapshot().room!.puzzle2!.draft).toEqual(solution);
    await a.client.send({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 2, order: solution } });
    expect(a.client.getSnapshot().room!.systems.terminal).toBe(true);

    g.advance(PHASE_COMPLETE_HOLD_MS);
    await a.client.send({ type: "player:heartbeat" });
    await b.client.send({ type: "player:heartbeat" });
    expect(a.client.getSnapshot().room!.phase).toBe("FINAL_SEQUENCE");
    await a.client.send({ type: "final:press", held: true });
    expect(a.client.getSnapshot().room!.phase).toBe("FINAL_SEQUENCE"); // one hold is not enough
    await b.client.send({ type: "final:press", held: true });
    await a.client.send({ type: "player:heartbeat" });
    for (const c of [a, b]) {
      const room = c.client.getSnapshot().room!;
      expect(room.phase).toBe("COMPLETE");
      expect(room.systems).toEqual({ breaker: true, terminal: true, door: true });
    }
  });

  it("never shows the previous phase's clue when new clues are dealt", async () => {
    const g = await startedGame();
    const { a, b } = g;
    await a.client.send({ type: "intro:skip" });
    const puzzle1Clue = b.client.getSnapshot().clue!.clues.join(" ");
    const seen: string[] = [];
    const off = b.client.subscribe(() => {
      const s = b.client.getSnapshot();
      if (s.room?.phase === "PUZZLE_2" && s.clue) seen.push(s.clue.clues.join(" "));
    });
    await a.client.send({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 1, physical: { source: "manual", order: ["book", "cup", "keys"] } } });
    g.advance(PHASE_COMPLETE_HOLD_MS);
    await b.client.send({ type: "player:heartbeat" }); // b sees PUZZLE_2 before its room:me returns
    expect(b.client.getSnapshot().room!.phase).toBe("PUZZLE_2");
    await flush();
    off();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(puzzle1Clue);
  });

  it("never sends client-side identity or verdicts the server would trust", async () => {
    const g = await startedGame();
    await g.a.client.send({ type: "intro:skip" });
    // Camera evidence whose claimed order is right but whose positions are wrong: rejected.
    await g.a.client.send({
      type: "puzzle:submit",
      submission: {
        roomCode: "",
        playerId: g.b.client.getSnapshot().selfId!,
        puzzle: 1,
        physical: { source: "camera", heldForMs: 5000, order: ["book", "cup", "keys"], markers: [{ id: "cup", center: { x: 0.1, y: 0.5 } }, { id: "book", center: { x: 0.5, y: 0.5 } }, { id: "keys", center: { x: 0.9, y: 0.5 } }] },
      },
    });
    expect(g.a.client.getSnapshot().lastSubmit).toMatchObject({ solved: false, reason: "Wrong order" });
    expect(g.n.log.at(-1)).toMatchObject({ code: g.code, playerToken: expect.any(String) });
  });
});
