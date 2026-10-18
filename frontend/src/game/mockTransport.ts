// LOCAL DEMO ONLY. Runs the real backend state machine inside this tab (engineServer), so
// the rules, phases and puzzle checks are exactly the server's. Bot teammates join, ready up,
// keep a heartbeat and copy the human's ACTIVATE hold. They never solve puzzles: the demo
// panel shows their private clues so one person can play every puzzle.
// Never used in production builds unless VITE_GAME_CLIENT=mock is set explicitly.
import { HEARTBEAT_INTERVAL_MS } from "@shared/constants";
import type { GameRequest, JoinData, MeData } from "@shared/events";
import type { JoinResultData } from "../../../backend/src/game/engine";
import { engineServer, randomId } from "./engineServer";
import type { Transport, TransportResult } from "./transport";

const TICK_MS = 250;
const BOT_NAMES = ["Dev", "Maya", "Rio"];
const BOT_JOIN_GAP_MS = 900;
const BOT_READY_AFTER_MS = 1_200;
const BOT_HOLD_DELAY_MS = 350;

type Bot = { name: string; token: string; playerId?: string };

export interface MockDemoInfo {
  bots: { name: string; clue: string[] }[];
}

export interface MockTransport extends Transport {
  demoInfo(): MockDemoInfo;
}

export function mockTransport(botCount = 2): MockTransport {
  const server = engineServer();
  let bots: Bot[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const inRoom = (code: string) => server.state?.code === code;

  const tick = setInterval(() => server.tick(), TICK_MS);
  const botBeat = setInterval(() => {
    for (const bot of bots) if (bot.playerId && server.state) server.run({ type: "player:heartbeat", tokenHash: bot.token });
  }, HEARTBEAT_INTERVAL_MS);

  function addBots(code: string) {
    bots = BOT_NAMES.slice(0, Math.max(1, Math.min(3, botCount))).map((name) => ({ name, token: randomId("bot") }));
    bots.forEach((bot, i) => {
      later(BOT_JOIN_GAP_MS * (i + 1), () => {
        if (!inRoom(code)) return;
        const res = server.run({ type: "room:join", playerId: randomId("p"), playerName: bot.name, tokenHash: bot.token });
        if (res.ok) bot.playerId = (res.data as JoinResultData).playerId;
        later(BOT_READY_AFTER_MS, () => {
          if (inRoom(code)) server.run({ type: "room:ready", ready: true, tokenHash: bot.token });
        });
      });
    });
  }

  /** Bots mirror the human's hold on the blast-door panel. */
  function mirrorHold(held: boolean) {
    later(held ? BOT_HOLD_DELAY_MS : 0, () => {
      if (server.state?.phase !== "FINAL_SEQUENCE") return;
      for (const bot of bots) server.run({ type: "final:press", held, tokenHash: bot.token });
    });
  }

  async function post<T>(body: GameRequest): Promise<TransportResult<T>> {
    const res = server.post<T>(body);
    if (body.type === "room:create" && res.ok) addBots((res.data as JoinData).code);
    if (body.type === "final:press" && res.ok) mirrorHold(body.held);
    if (!server.state) bots = [];
    return res;
  }

  return {
    mode: "mock",
    post,
    view: async (code) => server.view(code),
    demoInfo() {
      if (!server.state) return { bots: [] };
      return {
        bots: bots
          .filter((b) => b.playerId)
          .map((b) => {
            const res = server.run({ type: "room:me", tokenHash: b.token });
            return { name: b.name, clue: res.ok ? ((res.data as MeData).clue?.clues ?? []) : [] };
          }),
      };
    },
    dispose() {
      clearInterval(tick);
      clearInterval(botBeat);
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
