// Role reveal -> host Proceed -> 8-minute mission countdown, through the real client and engine.
import { describe, expect, it } from "vitest";
import { HOST_HANDOFF_AFTER_MS, MISSION_DURATION_MS } from "@shared/constants";
import type { Room } from "@shared/types";
import { formatClock, missionRemainingMs } from "../ui/time";
import { createGameClient } from "./client";
import { engineServer } from "./engineServer";
import type { Transport } from "./transport";

const flush = () => new Promise((r) => setTimeout(r, 0));

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

async function startedGame() {
  let clock = 1_000_000;
  const server = engineServer(() => clock);
  const transport = { mode: "live", post: async (body) => server.post(body), view: async (code) => server.view(code) } as Transport;
  const make = (storage = memoryStorage()) => ({
    storage,
    client: createGameClient(transport, { storage, visibility: null, pollMs: 1e9, heartbeatMs: 1e9, now: () => clock }),
  });
  const a = make();
  const b = make();
  await a.client.send({ type: "room:create", playerName: "Ana" });
  await b.client.send({ type: "room:join", code: a.client.getSnapshot().room!.code, playerName: "Ben" });
  await a.client.send({ type: "room:ready", ready: true });
  await b.client.send({ type: "room:ready", ready: true });
  await a.client.send({ type: "game:start" });
  await b.client.send({ type: "player:heartbeat" });
  await flush();
  return { server, a, b, make, advance: (ms: number) => (clock += ms), now: () => clock };
}

/** What MissionHeader shows for this room at server time `now`. */
const shown = (room: Room, now: number) =>
  room.missionStartedAt ? formatClock(missionRemainingMs(room.missionStartedAt, now, MISSION_DURATION_MS)) : null;

describe("mission countdown display", () => {
  it("formats 08:00 down to 00:00 and never goes negative", () => {
    const start = 5_000;
    expect(formatClock(missionRemainingMs(start, start, MISSION_DURATION_MS))).toBe("08:00");
    expect(formatClock(missionRemainingMs(start, start + 1_000, MISSION_DURATION_MS))).toBe("07:59");
    expect(formatClock(missionRemainingMs(start, start + 2_000, MISSION_DURATION_MS))).toBe("07:58");
    expect(formatClock(missionRemainingMs(start, start + 61_000, MISSION_DURATION_MS))).toBe("06:59");
    expect(formatClock(missionRemainingMs(start, start + MISSION_DURATION_MS - 1_000, MISSION_DURATION_MS))).toBe("00:01");
    expect(formatClock(missionRemainingMs(start, start + MISSION_DURATION_MS, MISSION_DURATION_MS))).toBe("00:00");
    expect(formatClock(missionRemainingMs(start, start + MISSION_DURATION_MS + 60_000, MISSION_DURATION_MS))).toBe("00:00");
    expect(missionRemainingMs(start, start + MISSION_DURATION_MS + 60_000, MISSION_DURATION_MS)).toBe(0);
    expect(formatClock(-5_000)).toBe("00:00");
    // A phone whose clock estimate runs slightly behind the server never shows more than 08:00.
    expect(formatClock(missionRemainingMs(start, start - 3_000, MISSION_DURATION_MS))).toBe("08:00");
  });
});

describe("role reveal and the mission countdown", () => {
  it("does not advance or run a countdown during role reveal", async () => {
    const g = await startedGame();
    g.advance(60_000);
    g.server.tick();
    await g.a.client.send({ type: "player:heartbeat" });
    const room = g.a.client.getSnapshot().room!;
    expect(room.phase).toBe("INTRO");
    expect(room.missionStartedAt).toBeUndefined();
  });

  it("only the host proceeds; both phones then count down the same time from 08:00", async () => {
    const g = await startedGame();
    await g.b.client.send({ type: "intro:skip" });
    expect(g.b.client.getSnapshot().lastError).toMatchObject({ code: "not_host", action: "intro:skip" });
    expect(g.b.client.getSnapshot().room!.phase).toBe("INTRO");

    await g.a.client.send({ type: "intro:skip" });
    await g.b.client.send({ type: "player:heartbeat" });
    const ra = g.a.client.getSnapshot().room!;
    const rb = g.b.client.getSnapshot().room!;
    expect(ra.phase).toBe("PUZZLE_1");
    expect(rb.phase).toBe("PUZZLE_1");
    expect(shown(ra, g.now())).toBe("08:00");
    expect(rb.missionStartedAt).toBe(ra.missionStartedAt);

    g.advance(3_000);
    expect(shown(ra, g.now())).toBe("07:57"); // counts down, not up
    expect(shown(rb, g.now())).toBe(shown(ra, g.now()));
  });

  it("a page reload keeps the remaining time", async () => {
    const g = await startedGame();
    await g.a.client.send({ type: "intro:skip" });
    g.advance(125_000);
    const reloaded = g.make(g.b.storage);
    reloaded.client.start();
    await flush();
    await flush();
    const room = reloaded.client.getSnapshot().room!;
    reloaded.client.stop();
    expect(room.phase).toBe("PUZZLE_1");
    expect(shown(room, g.now())).toBe("05:55");
  });

  it("a handed-off host can proceed", async () => {
    const g = await startedGame();
    for (let t = 0; t <= HOST_HANDOFF_AFTER_MS; t += 5_000) {
      g.advance(5_000);
      await g.b.client.send({ type: "player:heartbeat" });
    }
    expect(g.b.client.getSnapshot().room!.hostId).toBe(g.b.client.getSnapshot().selfId);
    await g.b.client.send({ type: "intro:skip" });
    expect(g.b.client.getSnapshot().room!.phase).toBe("PUZZLE_1");
  });

  it("game reset gives the next mission a fresh 08:00", async () => {
    const g = await startedGame();
    await g.a.client.send({ type: "intro:skip" });
    g.advance(10_000);
    await g.a.client.send({ type: "game:reset" });
    expect(g.a.client.getSnapshot().room!.phase).toBe("LOBBY");
    expect(g.a.client.getSnapshot().room!.missionStartedAt).toBeUndefined();
    await g.a.client.send({ type: "room:ready", ready: true });
    await g.b.client.send({ type: "room:ready", ready: true });
    await g.a.client.send({ type: "game:start" });
    g.advance(10_000);
    expect(g.a.client.getSnapshot().room!.missionStartedAt).toBeUndefined();
    await g.a.client.send({ type: "intro:skip" });
    expect(shown(g.a.client.getSnapshot().room!, g.now())).toBe("08:00");
  });
});
