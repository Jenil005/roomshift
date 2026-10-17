// GameClient on top of the RoomShift backend (backend/, DeepSpace). Contract: docs/game-api.md.
//
//  - send(action): one POST /api/game per action. The server decides every outcome.
//  - live state: polls GET /api/game/room/:code (public Room) about once a second; every POST
//    reply also carries the room, so the sender sees its own change at once.
//  - identity: room:create / room:join return a playerToken, kept in localStorage so a refreshed
//    phone rejoins the same seat with the same role and clues.
//  - private clues: fetched with room:me whenever the dealt puzzle changes (never in the Room).
//  - serverTimeOffset: the server stamps our own `lastSeen` on every request, which gives a
//    tight lower bound for serverNow - Date.now().
import type { GameClient } from "./GameClient";
import type { ClientAction, ClientSnapshot, GameState, RoleBriefing } from "../shared/types";
import type { ClientEvent, GameResult, JoinData, MeData, RoomData, SubmitData } from "@shared/events";
import type { PrivateClue, Room } from "@shared/types";
import { HEARTBEAT_INTERVAL_MS } from "@shared/constants";
import { POWER, ROLE_TITLE } from "./content";

// Empty = same origin (the Vite dev server proxies /api, see vite.config.ts).
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const POLL_MS = 1000;
const SESSION_KEY = "roomshift.session";
const DEMO = new URLSearchParams(window.location.search).has("demo");

interface Session {
  code: string;
  playerId: string;
  playerToken: string;
  name: string;
  startedAt?: number; // server ms when this mission's INTRO began (for the completion time)
}

type Request = ClientEvent & { code?: string; playerToken?: string };

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode or blocked storage: the game still works until the page reloads.
  }
}

/** Which clue set the server has dealt in this phase (clues change at PUZZLE_2). */
function clueSet(room: Room): "p1" | "p2" | null {
  switch (room.phase) {
    case "INTRO":
    case "PUZZLE_1":
    case "PUZZLE_1_COMPLETE":
      return "p1";
    case "PUZZLE_2":
    case "PUZZLE_2_COMPLETE":
    case "FINAL_SEQUENCE":
    case "COMPLETE":
      return "p2";
    default:
      return null;
  }
}

export function createDeepSpaceClient(): GameClient {
  let session = loadSession();
  let room: Room | null = null;
  let clue: PrivateClue | null = null;
  let clueKey: string | null = null; // `${code}:${clueSet}` the current clue belongs to
  let error: string | null = null;
  let homeError: string | null = null;
  let connecting = false;
  let offset: number | null = null;
  let polling = false;
  const listeners = new Set<() => void>();

  let snapshot: ClientSnapshot = { state: null, selfId: null, briefing: null, serverTimeOffset: 0 };

  function emit() {
    snapshot = {
      state: room && session ? toState(room, session) : null,
      selfId: room && session ? session.playerId : null,
      briefing: clue ? toBriefing(clue) : null,
      serverTimeOffset: offset ?? 0,
      connecting,
      homeError,
    };
    listeners.forEach((l) => l());
  }

  function toBriefing(c: PrivateClue): RoleBriefing {
    return { role: c.role, title: ROLE_TITLE[c.role] ?? c.role, clues: c.clues };
  }

  function toState(r: Room, s: Session): GameState {
    const puzzle = r.phase === "PUZZLE_1" ? r.puzzles[1] : r.phase === "PUZZLE_2" ? r.puzzles[2] : null;
    return {
      roomCode: r.code,
      phase: r.phase,
      players: r.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === r.hostId,
        ready: p.isReady,
        connected: p.connected,
        role: p.role,
      })),
      phaseStartedAt: r.phaseStartedAt,
      startedAt: r.timer?.startedAt ?? s.startedAt ?? null,
      timer: r.timer ?? null,
      completedAt: r.phase === "COMPLETE" ? r.phaseStartedAt : null,
      power: r.systems.door ? POWER.door : r.systems.terminal ? POWER.terminal : r.systems.breaker ? POWER.breaker : POWER.start,
      narration: r.narration ?? null,
      retryAt: puzzle?.retryAt ?? null,
      puzzle2Draft: (r.puzzle2?.draft ?? []) as GameState["puzzle2Draft"],
      puzzle2Hints: r.puzzle2?.hints ?? [],
      finalHolding: r.final?.holding ?? [],
      finalForceAt: r.final?.forceAvailableAt ?? null,
      lastError: error ?? puzzle?.lastFailure ?? null,
    };
  }

  /** Raise the clock offset to the newest lower bound the server has given us. */
  function noteServerTime(serverMs: number | undefined) {
    if (!serverMs || !Number.isFinite(serverMs)) return;
    const bound = serverMs - Date.now();
    if (offset === null || bound > offset) offset = bound;
  }

  /** Take the Room from any reply. Returns true if it changed what the UI shows. */
  function applyRoom(next: Room): boolean {
    if (!session || next.code !== session.code) return false;
    if (room && next.version < room.version) return false; // an older reply arrived late
    const changed = !room || next.version !== room.version;
    const phaseChanged = room?.phase !== next.phase;
    room = next;
    noteServerTime(next.players.find((p) => p.id === session!.playerId)?.lastSeen);
    noteServerTime(next.phaseStartedAt);
    if (phaseChanged) {
      error = null;
      let startedAt = session.startedAt;
      if (next.phase === "LOBBY" || next.phase === "READY") {
        clue = null;
        clueKey = null;
        startedAt = undefined;
      } else if (next.phase === "INTRO") {
        startedAt = next.phaseStartedAt;
      } else if (startedAt === undefined) {
        startedAt = next.phaseStartedAt; // joined or reloaded mid-game: approximate
      }
      if (startedAt !== session.startedAt) {
        session = { ...session, startedAt };
        saveSession(session);
      }
    }
    const set = clueSet(next);
    if (set && `${next.code}:${set}` !== clueKey) void fetchClue(`${next.code}:${set}`);
    return changed;
  }

  async function post<T>(event: Request, auth = true): Promise<GameResult<T>> {
    const body: Request = auth && session ? { code: session.code, playerToken: session.playerToken, ...event } : event;
    try {
      const res = await fetch(`${API}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      noteServerTime(Date.parse(res.headers.get("Date") ?? ""));
      return (await res.json()) as GameResult<T>;
    } catch {
      return { ok: false, code: "server_error", message: "Network error. Check your connection." };
    }
  }

  /** Server says this phone no longer has a seat: back to the home screen. */
  function dropSession(message: string | null) {
    session = null;
    room = null;
    clue = null;
    clueKey = null;
    error = null;
    homeError = message;
    saveSession(null);
    emit();
  }

  /** Handle a reply to an authenticated request. */
  function settle(res: GameResult<unknown>) {
    if (res.ok) {
      error = null;
      const data = res.data as Partial<RoomData & SubmitData>;
      if (data.room) applyRoom(data.room);
      if (data.solved === false) error = data.reason ?? "Sequence rejected.";
    } else if (res.code === "not_in_room" || res.code === "room_not_found") {
      return dropSession(res.message);
    } else {
      error = res.message;
    }
    emit();
  }

  async function fetchClue(key: string) {
    clueKey = key;
    const res = await post<MeData>({ type: "room:me" });
    if (!res.ok) {
      if (clueKey === key) clueKey = null; // retry on the next poll
      if (res.code === "not_in_room" || res.code === "room_not_found") dropSession(res.message);
      return;
    }
    if (clueKey !== key) return; // phase moved on while waiting; a newer fetch is running
    clue = res.data.clue;
    // Clues are dealt by the same state change that moves the phase; retry if we were early.
    if (!clue) clueKey = null;
    applyRoom(res.data.room);
    emit();
  }

  async function enterRoom(event: Request, name: string) {
    homeError = null;
    connecting = true;
    emit();
    const res = await post<JoinData>(event, false);
    connecting = false;
    if (!res.ok) {
      // A rejoin that failed only because of the network keeps the saved seat: polling and
      // heartbeats use the token directly, so the phone recovers once the server answers.
      if (res.code !== "server_error" && res.code !== "rate_limited") {
        session = null;
        saveSession(null);
      }
      homeError = res.message;
      return emit();
    }
    const startedAt = session?.code === res.data.code ? session.startedAt : undefined;
    session = { code: res.data.code, playerId: res.data.playerId, playerToken: res.data.playerToken, name, startedAt };
    saveSession(session);
    room = null;
    applyRoom(res.data.room);
    emit();
  }

  async function poll() {
    if (!session || polling) return;
    polling = true;
    try {
      const res = await fetch(`${API}/api/game/room/${encodeURIComponent(session.code)}`, { cache: "no-store" });
      const body = (await res.json()) as GameResult<RoomData>;
      if (body.ok) {
        if (applyRoom(body.data.room)) emit();
      } else if (body.code === "room_not_found") {
        dropSession("That room has closed.");
      }
    } catch {
      // Transient network loss: keep the last state and try again next tick.
    } finally {
      polling = false;
    }
  }

  function heartbeat() {
    if (!session) return;
    void post<RoomData>({ type: "player:heartbeat" }).then((res) => {
      if (res.ok) {
        if (applyRoom(res.data.room)) emit();
      } else if (res.code === "not_in_room" || res.code === "room_not_found") {
        dropSession(res.message);
      }
    });
  }

  window.setInterval(() => void poll(), POLL_MS);
  window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      heartbeat();
      void poll();
    }
  });

  // Page load: rejoin the saved room with the saved token (same seat, role and clues).
  if (session) {
    const saved = session;
    void enterRoom({ type: "room:join", code: saved.code, playerName: saved.name || "Player", playerToken: saved.playerToken }, saved.name);
  }

  function send(action: ClientAction) {
    switch (action.type) {
      case "room:create":
        // ?demo in the URL: the server gives this room the short mission clock.
        void enterRoom({ type: "room:create", playerName: action.name, ...(DEMO ? { demo: true } : {}) }, action.name);
        return;
      case "room:join": {
        const code = action.code.trim().toUpperCase();
        // Rejoining the room this phone already sat in keeps the old seat.
        const token = session?.code === code ? session.playerToken : undefined;
        void enterRoom({ type: "room:join", code, playerName: action.name, ...(token ? { playerToken: token } : {}) }, action.name);
        return;
      }
      case "room:leave":
        void post({ type: "room:leave" });
        dropSession(null);
        return;
      case "player:ready":
        void post<RoomData>({ type: "room:ready", ready: action.ready }).then(settle);
        return;
      case "puzzle:submit": {
        const submission =
          action.puzzle === 1
            ? {
                roomCode: "",
                playerId: "",
                puzzle: 1 as const,
                physical: {
                  source: action.result.source ?? (action.result.markers ? "camera" as const : "manual" as const),
                  order: action.result.order,
                  markers: action.result.markers,
                  heldForMs: action.result.heldForMs,
                },
              }
            : { roomCode: "", playerId: "", puzzle: 2 as const, order: action.order };
        void post<SubmitData>({ type: "puzzle:submit", submission }).then(settle);
        return;
      }
      case "puzzle2:draft":
        void post<RoomData>({ type: "puzzle2:draft", order: action.order }).then(settle);
        return;
      case "final:activate":
        void post<RoomData>({ type: "final:press", held: action.holding }).then(settle);
        return;
      case "game:start":
      case "intro:skip":
      case "final:force":
      case "game:reset":
        void post<RoomData>({ type: action.type }).then(settle);
        return;
      case "dev":
        void post<RoomData>({ type: "dev:command", command: action.command }).then(settle);
        return;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(l) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
    send,
  };
}
