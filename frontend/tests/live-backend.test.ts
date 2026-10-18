// End-to-end check of the real GameClient + HTTP transport against a RUNNING backend.
// Skipped unless ROOMSHIFT_API is set. Never point it at production without approval:
//   (cd backend && npx deepspace dev start --port 5199)
//   ROOMSHIFT_API=http://127.0.0.1:5199 npm test -- tests/live-backend.test.ts
import { describe, expect, it } from "vitest";
import { PUZZLE1_HOLD_MS } from "@shared/constants";
import { allOrders, describe as describeConstraint, MODULES, type Constraint } from "@shared/puzzles/commsBoot";
import type { Room } from "@shared/types";
import { createGameClient } from "../src/game/client";
import type { GameClient } from "../src/game/GameClient";
import { httpTransport } from "../src/game/transport";

const API = process.env.ROOMSHIFT_API;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

function player(storage = memoryStorage()) {
  const client = createGameClient(httpTransport(API!), { storage, visibility: null, pollMs: 500 });
  client.start();
  return { client, storage };
}

/** Waits until the client's own polling shows a room matching `test`. */
async function until(client: GameClient, test: (room: Room) => boolean, label: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const room = client.getSnapshot().room;
    if (room && test(room)) return room;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}; last phase ${client.getSnapshot().room?.phase}`);
}

/** What players do at the table: pool every clue line and find the one order they all allow. */
function solveFromClues(lines: string[]): string[] {
  const all: Constraint[] = [];
  for (const a of MODULES) {
    all.push({ kind: "notFirst", a }, { kind: "notLast", a }, { kind: "first", a }, { kind: "last", a });
    for (const b of MODULES) if (a !== b) all.push({ kind: "before", a, b });
  }
  const byText = new Map(all.map((c) => [describeConstraint(c), c]));
  const constraints = lines.map((l) => byText.get(l)!);
  const fits = allOrders().filter((o) =>
    constraints.every((c) => {
      const i = (m: string) => o.indexOf(m as never);
      switch (c.kind) {
        case "before": return i(c.a) < i(c.b);
        case "notFirst": return o[0] !== c.a;
        case "notLast": return o[o.length - 1] !== c.a;
        case "first": return o[0] === c.a;
        case "last": return o[o.length - 1] === c.a;
      }
    }),
  );
  expect(fits).toHaveLength(1);
  return fits[0];
}

describe.skipIf(!API)("live backend, two independent clients", () => {
  it("plays lobby -> COMPLETE with polling, private clues, rejoin and errors", async () => {
    const a = player();
    const b = player();
    try {
      expect((await a.client.send({ type: "room:create", playerName: "Ana" })).ok).toBe(true);
      const code = a.client.getSnapshot().room!.code;
      expect((await b.client.send({ type: "room:join", code, playerName: "Ben" })).ok).toBe(true);
      await until(a.client, (r) => r.players.length === 2, "A sees B join (polling)");

      // Error from the real server, shown with its code.
      await b.client.send({ type: "game:start" });
      expect(b.client.getSnapshot().lastError?.code).toBe("not_host");

      await a.client.send({ type: "room:ready", ready: true });
      await b.client.send({ type: "room:ready", ready: true });
      await until(a.client, (r) => r.phase === "READY", "READY");
      await a.client.send({ type: "game:start" });
      await until(b.client, (r) => r.phase === "INTRO", "B sees INTRO via polling");
      await sleep(600);
      const clueA = a.client.getSnapshot().clue!;
      const clueB = b.client.getSnapshot().clue!;
      expect(clueA.playerId).toBe(a.client.getSnapshot().selfId);
      expect(clueB.playerId).toBe(b.client.getSnapshot().selfId);
      expect(clueA.role).not.toBe(clueB.role);

      // B "reloads": a new client with the same storage gets the same seat back.
      b.client.stop();
      const b2 = player(b.storage);
      await until(b2.client, (r) => r.phase === "INTRO" || r.phase === "PUZZLE_1", "B rejoined");
      expect(b2.client.getSnapshot().selfId).toBe(b.client.getSnapshot().selfId);
      expect(b2.client.getSnapshot().room!.players).toHaveLength(2);

      await a.client.send({ type: "intro:skip" });
      await until(b2.client, (r) => r.phase === "PUZZLE_1", "PUZZLE_1");

      const wrong = { roomCode: "", playerId: "", puzzle: 1 as const, physical: { source: "camera" as const, heldForMs: PUZZLE1_HOLD_MS, markers: [{ id: "CUP", center: { x: 0.2, y: 0.5 } }, { id: "BOOK", center: { x: 0.5, y: 0.5 } }, { id: "KEYS", center: { x: 0.8, y: 0.5 } }] } };
      await b2.client.send({ type: "puzzle:submit", submission: wrong });
      expect(b2.client.getSnapshot().lastSubmit).toMatchObject({ solved: false, reason: "Wrong order" });
      await sleep(1_100);
      const right = { ...wrong, physical: { ...wrong.physical, markers: [{ id: "KEYS", center: { x: 0.85, y: 0.52 } }, { id: "BOOK", center: { x: 0.15, y: 0.5 } }, { id: "CUP", center: { x: 0.5, y: 0.48 } }] } };
      await b2.client.send({ type: "puzzle:submit", submission: right });
      expect(b2.client.getSnapshot().lastSubmit?.solved).toBe(true);
      await until(a.client, (r) => r.systems.breaker && r.puzzles[1].verifiedBy === "camera", "A sees breaker online");

      await until(a.client, (r) => r.phase === "PUZZLE_2", "PUZZLE_2", 10_000);
      await until(b2.client, (r) => r.phase === "PUZZLE_2", "B in PUZZLE_2");
      await sleep(800);
      const pooled = [...a.client.getSnapshot().clue!.clues, ...b2.client.getSnapshot().clue!.clues];
      const order = solveFromClues(pooled);
      await a.client.send({ type: "puzzle2:draft", order: order.slice(0, 2) });
      await b2.client.send({ type: "puzzle2:draft", order });
      await until(a.client, (r) => r.puzzle2?.draft.join() === order.join(), "A sees B's draft");
      await a.client.send({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 2, order } });
      expect(a.client.getSnapshot().lastSubmit?.solved).toBe(true);

      await until(b2.client, (r) => r.phase === "FINAL_SEQUENCE", "FINAL_SEQUENCE", 10_000);
      await a.client.send({ type: "final:press", held: true });
      await until(b2.client, (r) => (r.final?.holding.length ?? 0) === 1, "B sees A holding");
      await b2.client.send({ type: "final:press", held: true });
      for (const c of [a.client, b2.client]) {
        const room = await until(c, (r) => r.phase === "COMPLETE", "COMPLETE");
        expect(room.systems).toEqual({ breaker: true, terminal: true, door: true });
      }
      b2.client.stop();
      await a.client.send({ type: "room:leave" });
    } finally {
      a.client.stop();
      b.client.stop();
    }
  }, 60_000);
});
