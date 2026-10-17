// Local stand-in for the DeepSpace backend, so the frontend can be built and demoed
// on one phone. It plays the "server": it owns the state and decides every outcome.
// Bot players join, ready up, scan, and hold ACTIVATE so one person can test the full loop.
import type { GameClient } from "./GameClient";
import type { ClientAction, ClientSnapshot, GameState, Player, RoleId } from "../shared/types";
import { FINAL_CODE, PUZZLE_1_SOLUTION, PUZZLE_2_WINDOW_MS, buildBriefing } from "./content";

const params = new URLSearchParams(window.location.search);
const BOT_COUNT = Math.max(0, Math.min(2, Number(params.get("bots") ?? 2)));
const DEMO = params.has("demo");
const MISSION_MS = (DEMO ? 180 : 480) * 1000;
const PHASE_PAUSE_MS = 2500;
const BOT_NAMES = ["Dev", "Maya"];
const ROLE_ORDER: RoleId[] = ["ARCHIVIST", "COURIER", "TIMEKEEPER"];

const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

export function createMockClient(): GameClient {
  let state: GameState | null = null;
  let selfId: string | null = null;
  const listeners = new Set<() => void>();
  const timers: number[] = [];

  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.splice(0).forEach(clearTimeout); };
  const isBot = (p: Player) => p.id !== selfId;

  let snapshot: ClientSnapshot = { state: null, selfId: null, briefing: null, serverTimeOffset: 0 };
  function emit() {
    const me = state?.players.find((p) => p.id === selfId);
    snapshot = {
      state: state ? structuredClone(state) : null,
      selfId,
      briefing: me?.role && state ? buildBriefing(me.role, state.players.length) : null,
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
    update((s) => { s.phase = phase; s.lastError = null; });
    if (phase === "PUZZLE_2") scheduleBotScansIfHumanIsTimekeeper();
  }

  // Deadline check, the way the server would enforce it.
  window.setInterval(() => {
    if (!state?.deadline) return;
    const live = !["LOBBY", "READY", "COMPLETE", "FAILED"].includes(state.phase);
    if (live && Date.now() >= state.deadline) {
      clearTimers();
      update((s) => { s.phase = "FAILED"; s.finalHolding = []; });
    }
  }, 500);

  function addBots() {
    for (let i = 0; i < BOT_COUNT; i++) {
      later(1200 * (i + 1), () => {
        update((s) => { s.players.push({ id: uid(), name: BOT_NAMES[i], isHost: false, ready: false, connected: true }); });
        later(1500, () => update((s) => { const b = s.players.find((p) => p.name === BOT_NAMES[i]); if (b) b.ready = true; }));
      });
    }
  }

  function scheduleBotScansIfHumanIsTimekeeper() {
    const me = state?.players.find((p) => p.id === selfId);
    if (me?.role !== "TIMEKEEPER") return;
    later(6000, () => {
      if (state?.phase !== "PUZZLE_2") return;
      const now = Date.now();
      update((s) => s.players.filter((p) => isBot(p) && p.role !== "TIMEKEEPER").forEach((b, i) => { s.puzzle2Scans[b.id] = now + i * 800; }));
      checkPuzzle2();
    });
  }

  function checkPuzzle2() {
    if (!state || state.phase !== "PUZZLE_2") return;
    const scanners = state.players.filter((p) => p.role && buildBriefing(p.role, state!.players.length).puzzle2Target);
    const times = scanners.map((p) => state!.puzzle2Scans[p.id]).filter((t): t is number => typeof t === "number");
    if (times.length < scanners.length) return;
    if (Math.max(...times) - Math.min(...times) <= PUZZLE_2_WINDOW_MS) {
      update((s) => { s.phase = "PUZZLE_2_COMPLETE"; s.power = 70; s.lastError = null; });
      later(PHASE_PAUSE_MS, () => goTo("FINAL_OVERRIDE"));
    } else {
      update((s) => { s.puzzle2Scans = {}; s.lastError = "Out of sync. Scans must land within 5 seconds."; });
    }
  }

  function checkFinal() {
    if (!state || state.phase !== "FINAL_OVERRIDE") return;
    if (state.finalCodeAccepted && state.players.every((p) => state!.finalHolding.includes(p.id))) {
      clearTimers();
      update((s) => { s.phase = "COMPLETE"; s.power = 100; s.completedAt = Date.now(); s.finalHolding = []; });
    }
  }

  function handle(action: ClientAction) {
    switch (action.type) {
      case "room:create":
      case "room:join": {
        selfId = uid();
        const code = action.type === "room:join" ? action.code.toUpperCase() : roomCode();
        state = {
          roomCode: code, phase: "LOBBY", startedAt: null, deadline: null, completedAt: null, power: 0,
          players: [{ id: selfId, name: action.name || "Agent", isHost: true, ready: false, connected: true }],
          puzzle2Scans: {}, finalCodeAccepted: false, finalHolding: [], lastError: null,
        };
        emit();
        addBots();
        return;
      }
      case "room:leave":
        clearTimers(); state = null; selfId = null; emit(); return;
      case "player:ready":
        update((s) => { const me = s.players.find((p) => p.id === selfId); if (me) me.ready = action.ready; });
        return;
      case "game:start": {
        if (!state || state.players.length < 2 || !state.players.every((p) => p.ready)) {
          update((s) => { s.lastError = "Need 2 to 3 operatives, all ready."; });
          return;
        }
        const shuffled = [...ROLE_ORDER].sort(() => Math.random() - 0.5);
        const roles = state.players.length === 2 ? shuffled.filter((r) => r !== "TIMEKEEPER") : shuffled;
        update((s) => {
          s.players.forEach((p, i) => { p.role = roles[i]; p.introAcked = isBot(p); });
          s.phase = "INTRO"; s.startedAt = Date.now(); s.deadline = Date.now() + MISSION_MS; s.lastError = null;
        });
        return;
      }
      case "intro:ack":
        update((s) => { const me = s.players.find((p) => p.id === selfId); if (me) me.introAcked = true; });
        if (state?.players.every((p) => p.introAcked)) goTo("PUZZLE_1");
        return;
      case "puzzle:submit":
        if (action.puzzle === 1) {
          if (state?.phase !== "PUZZLE_1") return;
          const ok = action.result.solved && JSON.stringify(action.result.order) === JSON.stringify(PUZZLE_1_SOLUTION);
          if (ok) {
            update((s) => { s.phase = "PUZZLE_1_COMPLETE"; s.power = 35; s.lastError = null; });
            later(PHASE_PAUSE_MS, () => goTo("PUZZLE_2"));
          } else {
            update((s) => { s.lastError = "Sequence rejected. Compare your fragments again."; });
          }
        } else {
          if (state?.phase !== "PUZZLE_2" || !selfId) return;
          const now = Date.now();
          update((s) => { s.puzzle2Scans[selfId!] = now; s.lastError = null; });
          // Bot scanners answer a moment later, as a coordinated partner would.
          later(1200, () => {
            if (state?.phase !== "PUZZLE_2") return;
            update((s) => s.players.filter((p) => isBot(p) && p.role !== "TIMEKEEPER").forEach((b) => { s.puzzle2Scans[b.id] ??= Date.now(); }));
            checkPuzzle2();
          });
          checkPuzzle2();
        }
        return;
      case "final:code":
        update((s) => {
          s.finalCodeAccepted = action.code === FINAL_CODE;
          s.lastError = s.finalCodeAccepted ? null : "Code rejected.";
        });
        return;
      case "final:activate":
        if (state?.phase !== "FINAL_OVERRIDE" || !selfId) return;
        update((s) => {
          s.finalHolding = s.finalHolding.filter((id) => id !== selfId);
          if (action.holding) s.finalHolding.push(selfId!);
        });
        if (action.holding) later(400, () => {
          if (!state?.finalHolding.includes(selfId!)) return;
          update((s) => s.players.filter(isBot).forEach((b) => { if (!s.finalHolding.includes(b.id)) s.finalHolding.push(b.id); }));
          checkFinal();
        });
        else update((s) => { s.finalHolding = s.finalHolding.filter((id) => !s.players.some((p) => p.id === id && isBot(p))); });
        checkFinal();
        return;
      case "game:reset":
        clearTimers();
        update((s) => {
          s.phase = "LOBBY"; s.startedAt = null; s.deadline = null; s.completedAt = null; s.power = 0;
          s.puzzle2Scans = {}; s.finalCodeAccepted = false; s.finalHolding = []; s.lastError = null;
          s.players.forEach((p) => { p.ready = isBot(p); p.role = undefined; p.introAcked = false; });
        });
        return;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    send: handle,
    // Dev-only phase jump (used by the ?dev panel). Not part of GameClient.
    __jump(phase: GameState["phase"]) {
      if (!state) {
        handle({ type: "room:create", name: "You" });
        clearTimers();
        update((s) => BOT_NAMES.slice(0, BOT_COUNT).forEach((name) => s.players.push({ id: uid(), name, isHost: false, ready: true, connected: true })));
      }
      if (!state!.players.some((p) => p.role)) {
        update((s) => {
          s.players.forEach((p, i) => { p.ready = true; p.introAcked = true; p.role = ROLE_ORDER[i % ROLE_ORDER.length]; });
          s.startedAt = Date.now(); s.deadline = Date.now() + MISSION_MS;
        });
      }
      clearTimers();
      update((s) => {
        s.phase = phase; s.lastError = null; s.puzzle2Scans = {}; s.finalHolding = [];
        s.power = { PUZZLE_1_COMPLETE: 35, PUZZLE_2: 35, PUZZLE_2_COMPLETE: 70, FINAL_OVERRIDE: 70, COMPLETE: 100 }[phase as string] ?? s.power;
        if (phase === "COMPLETE") s.completedAt = Date.now();
        if (phase === "FINAL_OVERRIDE") s.finalCodeAccepted = false;
      });
    },
  } as GameClient;
}

/** Dev-only: jump straight to a phase to work on its screen. */
export function devJump(client: GameClient, phase: GameState["phase"]) {
  (client as unknown as { __jump?: (p: GameState["phase"]) => void }).__jump?.(phase);
}
