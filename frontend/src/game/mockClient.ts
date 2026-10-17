// Local stand-in for the DeepSpace backend, so the frontend can be built and demoed
// on one phone. It plays the "server" with the same rules as backend/: it owns the state and
// decides every outcome. Puzzle 2 runs the real shared generator (shared/puzzles/commsBoot.ts).
// Bot players join, ready up, read their clues out loud, and hold the door with you.
import type { GameClient } from "./GameClient";
import type { ClientAction, ClientSnapshot, GameState, ModuleId, Player, RoleId } from "../shared/types";
import { checkOrder, describe, generatePuzzle, type ModuleId as SharedModuleId } from "@shared/puzzles/commsBoot";
import type { DevCommand, DevJumpPhase } from "@shared/events";
import {
  DEMO_MISSION_DURATION_MS,
  DEV_TIMER_MAX_MS,
  FINAL_FORCE_AFTER_MS,
  FINAL_SYNC_WINDOW_MS,
  INTRO_DURATION_MS,
  MISSION_DURATION_MS,
  PHASE_COMPLETE_HOLD_MS,
  PUZZLE1_COOLDOWN_MS,
  PUZZLE2_COOLDOWNS_MS,
  PUZZLE2_HINT_AFTER_ATTEMPTS,
  ROLE_IDS,
} from "@shared/constants";
import { POWER, PUZZLE_1_SOLUTION, ROLE_TITLE, dealPuzzle1Clues } from "./content";

const params = new URLSearchParams(window.location.search);
const BOT_COUNT = Math.max(0, Math.min(2, Number(params.get("bots") ?? 2)));
const DEMO = params.has("demo");
const MISSION_MS = DEMO ? DEMO_MISSION_DURATION_MS : MISSION_DURATION_MS;
const BOT_NAMES = ["Dev", "Maya"];

const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const shuffled = <T,>(items: readonly T[]) => [...items].sort(() => Math.random() - 0.5);

export function createMockClient(): GameClient {
  let state: GameState | null = null;
  let selfId: string | null = null;
  let clues: Record<string, string[]> = {};
  let solution: SharedModuleId[] = [];
  let hints: string[] = [];
  let attempts2 = 0;
  const releases: Record<string, number> = {}; // final: when each player let go
  const listeners = new Set<() => void>();
  const timers: number[] = [];

  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.splice(0).forEach(clearTimeout); };
  const isBot = (p: Player) => p.id !== selfId;

  let snapshot: ClientSnapshot = { state: null, selfId: null, briefing: null, serverTimeOffset: 0 };
  function emit() {
    const me = state?.players.find((p) => p.id === selfId);
    // Bots "say their clues out loud": in the mock you hear them as extra lines.
    const spoken = state?.players.filter(isBot).flatMap((b) => (clues[b.id] ?? []).map((c) => `${b.name} says: ${c}`)) ?? [];
    snapshot = {
      state: state ? structuredClone(state) : null,
      selfId,
      briefing: me?.role && selfId && clues[selfId]
        ? { role: me.role, title: ROLE_TITLE[me.role], clues: [...clues[selfId], ...spoken] }
        : null,
      serverTimeOffset: 0,
    };
    listeners.forEach((l) => l());
  }
  function update(fn: (s: GameState) => void) {
    if (!state) return;
    fn(state);
    emit();
  }

  function goTo(phase: GameState["phase"]) {
    update((s) => { s.phase = phase; s.phaseStartedAt = Date.now(); s.lastError = null; s.retryAt = null; });
  }

  function enterPuzzle2() {
    if (!state) return;
    const ids = state.players.map((p) => p.id);
    const generated = generatePuzzle(ids, Math.floor(Math.random() * 2 ** 32));
    solution = generated.solution;
    hints = generated.hints.map(describe);
    attempts2 = 0;
    clues = Object.fromEntries(ids.map((id) => [id, generated.constraints[id].map(describe)]));
    update((s) => { s.puzzle2Draft = []; s.puzzle2Hints = []; });
    goTo("PUZZLE_2");
  }

  function solve1() {
    update((s) => { s.power = POWER.breaker; });
    goTo("PUZZLE_1_COMPLETE");
    later(PHASE_COMPLETE_HOLD_MS, enterPuzzle2);
  }

  function solve2() {
    update((s) => { s.power = POWER.terminal; });
    goTo("PUZZLE_2_COMPLETE");
    later(PHASE_COMPLETE_HOLD_MS, enterFinal);
  }

  function enterFinal() {
    update((s) => { s.finalHolding = []; s.finalForceAt = Date.now() + FINAL_FORCE_AFTER_MS; });
    goTo("FINAL_SEQUENCE");
  }

  const inMission = () => !!state && !["LOBBY", "READY", "COMPLETE", "FAILED"].includes(state.phase);

  function complete() {
    clearTimers();
    update((s) => {
      s.power = POWER.door; s.completedAt = Date.now(); s.finalHolding = []; s.finalForceAt = null;
      if (s.timer?.deadline) s.timer = { ...s.timer, deadline: null, pausedRemainingMs: Math.max(0, s.timer.deadline - Date.now()) };
    });
    goTo("COMPLETE");
  }

  function fail() {
    clearTimers();
    update((s) => { s.finalHolding = []; });
    goTo("FAILED");
  }

  // Deadline check, the way the server's alarm enforces it.
  window.setInterval(() => {
    const deadline = state?.timer?.deadline;
    if (inMission() && deadline && Date.now() >= deadline) fail();
  }, 500);

  function addBots() {
    for (let i = 0; i < BOT_COUNT; i++) {
      later(1200 * (i + 1), () => {
        update((s) => { s.players.push({ id: uid(), name: BOT_NAMES[i], isHost: false, ready: false, connected: true }); });
        later(1500, () => update((s) => { const b = s.players.find((p) => p.name === BOT_NAMES[i]); if (b) b.ready = true; }));
      });
    }
  }

  /** Same rule as the server: everyone holding now, or let go within the sync window. */
  function checkFinal() {
    if (!state || state.phase !== "FINAL_SEQUENCE") return;
    const now = Date.now();
    const ok = state.players.every((p) => state!.finalHolding.includes(p.id) || now - (releases[p.id] ?? -Infinity) <= FINAL_SYNC_WINDOW_MS);
    if (ok) complete();
  }

  function startMission() {
    if (!state) return;
    const roles = shuffled(ROLE_IDS) as RoleId[];
    clues = dealPuzzle1Clues(state.players.map((p) => p.id));
    update((s) => {
      s.players.forEach((p, i) => { p.role = roles[i]; });
      const now = Date.now();
      s.startedAt = now; s.lastError = null;
      s.timer = { startedAt: now, durationMs: MISSION_MS, deadline: now + MISSION_MS, pausedRemainingMs: null };
    });
    goTo("INTRO");
    later(INTRO_DURATION_MS, () => { if (state?.phase === "INTRO") goTo("PUZZLE_1"); });
  }

  function handle(action: ClientAction) {
    const me = state?.players.find((p) => p.id === selfId);
    switch (action.type) {
      case "room:create":
      case "room:join": {
        selfId = uid();
        const code = action.type === "room:join" ? action.code.toUpperCase() : roomCode();
        const now = Date.now();
        state = {
          roomCode: code, phase: "LOBBY", phaseStartedAt: now, startedAt: null, timer: null, completedAt: null, power: POWER.start,
          narration: null, retryAt: null, puzzle2Draft: [], puzzle2Hints: [], finalHolding: [], finalForceAt: null, lastError: null,
          players: [{ id: selfId, name: action.name || "Agent", isHost: true, ready: false, connected: true }],
        };
        emit();
        addBots();
        return;
      }
      case "room:leave":
        clearTimers(); state = null; selfId = null; clues = {}; emit(); return;
      case "player:ready":
        update((s) => { if (me) me.ready = action.ready; s.phase = s.players.length >= 2 && s.players.every((p) => p.ready) ? "READY" : "LOBBY"; });
        return;
      case "game:start":
        if (!state || state.players.length < 2 || !state.players.every((p) => p.ready)) {
          update((s) => { s.lastError = "Everyone must be ready first."; });
          return;
        }
        startMission();
        return;
      case "intro:skip":
        if (state?.phase === "INTRO" && me?.isHost) goTo("PUZZLE_1");
        return;
      case "puzzle:submit": {
        if (!state) return;
        const now = Date.now();
        if (state.retryAt && now < state.retryAt) {
          update((s) => { s.lastError = "Cooling down, try again in a moment."; });
          return;
        }
        if (action.puzzle === 1) {
          if (state.phase !== "PUZZLE_1") return;
          const order = (action.result.order ?? []).map((id) => id.toUpperCase());
          if (JSON.stringify(order) === JSON.stringify(PUZZLE_1_SOLUTION)) {
            solve1();
          } else {
            update((s) => { s.lastError = "Wrong order"; s.retryAt = now + PUZZLE1_COOLDOWN_MS; });
          }
          return;
        }
        if (state.phase !== "PUZZLE_2") return;
        if (checkOrder(solution, action.order).ok) {
          solve2();
          return;
        }
        attempts2 += 1;
        const wait = PUZZLE2_COOLDOWNS_MS[Math.min(attempts2, PUZZLE2_COOLDOWNS_MS.length) - 1];
        const released = PUZZLE2_HINT_AFTER_ATTEMPTS.filter((n) => attempts2 >= n).length;
        update((s) => { s.lastError = "Sequence rejected"; s.retryAt = now + wait; s.puzzle2Hints = hints.slice(0, released); });
        return;
      }
      case "puzzle2:draft":
        if (state?.phase !== "PUZZLE_2") return;
        update((s) => { s.puzzle2Draft = [...new Set(action.order)].slice(0, 4) as ModuleId[]; });
        return;
      case "final:activate":
        if (state?.phase !== "FINAL_SEQUENCE" || !selfId) return;
        if (!action.holding) releases[selfId] = Date.now();
        update((s) => {
          s.finalHolding = s.finalHolding.filter((id) => id !== selfId);
          if (action.holding) s.finalHolding.push(selfId!);
        });
        // Bots put their hands on the panel a moment after you do, and let go when you do.
        if (action.holding) later(400, () => {
          if (!state?.finalHolding.includes(selfId!)) return;
          update((s) => s.players.filter(isBot).forEach((b) => { if (!s.finalHolding.includes(b.id)) s.finalHolding.push(b.id); }));
          checkFinal();
        });
        else update((s) => { s.finalHolding = s.finalHolding.filter((id) => !s.players.some((p) => p.id === id && isBot(p))); });
        checkFinal();
        return;
      case "final:force":
        if (state?.phase === "FINAL_SEQUENCE" && me?.isHost && state.finalForceAt && Date.now() >= state.finalForceAt) complete();
        return;
      case "game:reset":
        clearTimers();
        clues = {};
        update((s) => {
          s.startedAt = null; s.timer = null; s.completedAt = null; s.power = POWER.start;
          s.puzzle2Draft = []; s.puzzle2Hints = []; s.finalHolding = []; s.finalForceAt = null;
          s.players.forEach((p) => { p.ready = isBot(p); p.role = undefined; });
        });
        goTo("LOBBY");
        return;
      case "dev":
        // The panel can be used before a room exists: make one, bots already seated.
        if (!state) {
          handle({ type: "room:create", name: "You" });
          clearTimers();
        }
        runDev(action.command);
        return;
    }
  }

  /** Same dev commands and rules as the server (backend/src/game/engine.ts runDevCommand). */
  function runDev(command: DevCommand) {
    if (!state) return;
    const refuse = (message: string) => update((s) => { s.lastError = message; });
    const timer = state.timer;
    const now = Date.now();
    switch (command.kind) {
      case "timer:pause": {
        if (!inMission() || !timer) return refuse("The mission clock is not running");
        const deadline = timer.deadline;
        if (deadline !== null) update((s) => { s.timer = { ...timer, deadline: null, pausedRemainingMs: Math.max(0, deadline - now) }; });
        return;
      }
      case "timer:resume": {
        if (!inMission() || !timer) return refuse("The mission clock is not running");
        const left = timer.pausedRemainingMs;
        if (left !== null) update((s) => { s.timer = { ...timer, deadline: now + left, pausedRemainingMs: null }; });
        return;
      }
      case "timer:set": {
        if (!inMission() || !timer) return refuse("The mission clock is not running");
        const ms = Math.round(command.remainingMs);
        if (!(ms >= 1000 && ms <= DEV_TIMER_MAX_MS)) return refuse("Time must be 1 s to 60 min");
        update((s) => {
          s.timer = timer.deadline === null ? { ...timer, pausedRemainingMs: ms } : { ...timer, deadline: now + ms, pausedRemainingMs: null };
        });
        return;
      }
      case "fail":
        return inMission() ? fail() : refuse("No mission in progress");
      case "win":
        return inMission() ? complete() : refuse("No mission in progress");
      case "clear":
        clearTimers();
        switch (state.phase) {
          case "INTRO": return goTo("PUZZLE_1");
          case "PUZZLE_1": return solve1();
          case "PUZZLE_1_COMPLETE": return enterPuzzle2();
          case "PUZZLE_2": return solve2();
          case "PUZZLE_2_COMPLETE": return enterFinal();
          case "FINAL_SEQUENCE": return complete();
          default: return refuse("No stage to clear");
        }
      case "jump":
        return jump(command.phase);
    }
  }

  function jump(phase: DevJumpPhase) {
    if (!state) return;
    if (state.phase === "LOBBY" || state.phase === "READY") {
      // Seat the bots now instead of waiting for them to wander in.
      update((s) => BOT_NAMES.slice(0, BOT_COUNT).forEach((name) => {
        if (!s.players.some((p) => p.name === name)) s.players.push({ id: uid(), name, isHost: false, ready: true, connected: true });
      }));
      if (state.players.length < 2) return update((s) => { s.lastError = "Need at least 2 players (drop ?bots=0)"; });
      update((s) => s.players.forEach((p) => { p.ready = true; }));
      startMission();
    } else if (!inMission()) {
      // Jumping out of an ended mission replays it: fresh clock, same roles.
      const now = Date.now();
      update((s) => { s.timer = { startedAt: now, durationMs: MISSION_MS, deadline: now + MISSION_MS, pausedRemainingMs: null }; s.startedAt = now; s.completedAt = null; });
    }
    clearTimers();
    if (phase === "FAILED") return fail();
    if (phase === "COMPLETE") return complete();
    update((s) => { s.finalHolding = []; s.power = phase === "PUZZLE_2" ? POWER.breaker : phase === "FINAL_SEQUENCE" ? POWER.terminal : POWER.start; });
    if (phase === "PUZZLE_2") return enterPuzzle2();
    if (phase === "FINAL_SEQUENCE") {
      enterPuzzle2(); // deals the puzzle 2 clues the finale screens show
      return enterFinal();
    }
    clues = dealPuzzle1Clues(state.players.map((p) => p.id));
    goTo(phase);
    if (phase === "INTRO") later(INTRO_DURATION_MS, () => { if (state?.phase === "INTRO") goTo("PUZZLE_1"); });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    send: handle,
  };
}
