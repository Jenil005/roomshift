// Canonical GameClient on top of a Transport (real HTTP API or the in-tab mock engine).
// - create/join store the playerToken; a reload rejoins the same seat with it
// - public state: polled GET /api/game/room/:code while the page is visible, plus the room
//   returned by every request; older versions are ignored so the snapshot never goes back
// - presence: player:heartbeat every HEARTBEAT_INTERVAL_MS
// - private clue: room:me after every phase change (clues change at INTRO and PUZZLE_2)
import { HEARTBEAT_INTERVAL_MS } from "@shared/constants";
import type { ClientEvent, GameRequest, GameResult, JoinData, MeData, SubmitData } from "@shared/events";
import type { Room } from "@shared/types";
import type { ClientError, ClientSnapshot, ConnectionStatus, GameClient } from "./GameClient";
import type { Transport, TransportResult } from "./transport";

export const SESSION_KEY = "roomshift.session.v2";
export const POLL_INTERVAL_MS = 1_000;
// The shared boot-order draft is edited by several phones at once: poll faster there.
export const FAST_POLL_INTERVAL_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const OFFLINE_AFTER_FAILURES = 5;

export interface StoredSession {
  code: string;
  playerId: string;
  playerToken: string;
  name: string;
}

export interface ClientOptions {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
  pollMs?: number;
  heartbeatMs?: number;
  /** Visibility source; defaults to `document`. Tests pass a stub. */
  visibility?: { hidden: boolean; addEventListener(t: "visibilitychange", l: () => void): void; removeEventListener(t: "visibilitychange", l: () => void): void } | null;
}

// Background requests never surface as user-facing errors (only as connection status).
const BACKGROUND = new Set<ClientEvent["type"]>(["player:heartbeat", "room:me"]);
// Replies meaning this seat or room no longer exists: forget the stored session.
const SEAT_GONE = new Set(["not_in_room", "room_not_found"]);

function defaultStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked: the game still works until the page reloads
  }
}

export function createGameClient(transport: Transport, options: ClientOptions = {}): GameClient {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? POLL_INTERVAL_MS;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS;
  const visibility = options.visibility === undefined ? (typeof document === "undefined" ? null : document) : options.visibility;

  let session: StoredSession | null = loadSession();
  let snap: ClientSnapshot = {
    mode: transport.mode,
    room: null,
    selfId: session?.playerId ?? null,
    clue: null,
    connection: "idle",
    resuming: session !== null,
    pending: null,
    lastError: null,
    lastSubmit: null,
    serverTimeOffset: 0,
  };
  const listeners = new Set<() => void>();
  let running = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let beatTimer: ReturnType<typeof setInterval> | undefined;
  let failures = 0;
  let clueForPhase: string | null = null; // "<code>:<phase>:<version-of-reset>" the clue was fetched for
  let meInFlight = false;
  let offsetSamples = 0;

  function loadSession(): StoredSession | null {
    try {
      const raw = storage?.getItem(SESSION_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
      return parsed?.code && parsed.playerToken && parsed.playerId ? parsed : null;
    } catch {
      return null;
    }
  }
  function saveSession(next: StoredSession | null) {
    session = next;
    try {
      if (next) storage?.setItem(SESSION_KEY, JSON.stringify(next));
      else storage?.removeItem(SESSION_KEY);
    } catch {
      // Private mode or blocked storage.
    }
  }

  function update(patch: Partial<ClientSnapshot>) {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof ClientSnapshot)[]) {
      if (snap[key] !== patch[key]) changed = true;
    }
    if (!changed) return; // keep the same object so useSyncExternalStore does not re-render
    snap = { ...snap, ...patch };
    listeners.forEach((l) => l());
  }

  function setConnection(connection: ConnectionStatus) {
    update({ connection });
  }

  /** Drops the seat locally (room ended, token rejected, or left). */
  function forget(error: ClientError | null) {
    saveSession(null);
    clueForPhase = null;
    stopLoops();
    update({ room: null, selfId: null, clue: null, connection: "idle", resuming: false, pending: null, lastSubmit: null, lastError: error });
  }

  /** Accepts a room view unless it is older than what we already show. */
  function applyRoom(room: Room) {
    const current = snap.room;
    if (current && current.code === room.code && room.version <= current.version) return;
    estimateOffset(room, current);
    const lobby = room.phase === "LOBBY" || room.phase === "READY";
    if (lobby) clueForPhase = null; // after game:reset the next INTRO deals new clues
    update({ room, clue: lobby ? null : snap.clue });
    if (!lobby) maybeRefreshClue(room);
  }

  // Server events carry server timestamps: a new event's `at` is <= server now, so
  // at - localNow is a lower bound of the offset. The largest bound seen is the estimate.
  function estimateOffset(room: Room, previous: Room | null) {
    const lastSeq = previous && previous.code === room.code ? (previous.events.at(-1)?.seq ?? 0) : Infinity;
    const fresh = room.events.filter((e) => e.seq > lastSeq);
    if (fresh.length === 0) return;
    const bound = Math.max(...fresh.map((e) => e.at)) - now();
    if (offsetSamples === 0 || bound > snap.serverTimeOffset) update({ serverTimeOffset: bound });
    offsetSamples += 1;
  }

  function maybeRefreshClue(room: Room) {
    const me = room.players.find((p) => p.id === snap.selfId);
    if (!me?.role) return;
    const key = `${room.code}:${room.phase}`;
    if (clueForPhase === key || meInFlight) return;
    meInFlight = true;
    void request({ type: "room:me" }).then((res) => {
      meInFlight = false;
      if (res.ok) clueForPhase = key;
      // The phase may have moved on while this was in flight.
      if (snap.room && `${snap.room.code}:${snap.room.phase}` !== clueForPhase) maybeRefreshClue(snap.room);
    });
  }

  function errorFrom(event: ClientEvent, res: TransportResult): ClientError {
    if (res.ok) throw new Error("not an error");
    return {
      code: res.network ? "network" : res.code,
      message: res.message,
      action: event.type,
      retryAt: res.retryAfterMs !== undefined ? now() + res.retryAfterMs : undefined,
      at: now(),
    };
  }

  /** Low-level request with the session attached. Applies any room in the reply. */
  async function request<T = unknown>(event: ClientEvent): Promise<TransportResult<T>> {
    const needsSession = event.type !== "room:create" && event.type !== "room:join";
    if (needsSession && !session) {
      return { ok: false, code: "not_in_room", message: "You are not in a room." };
    }
    const body: GameRequest = needsSession ? { ...event, code: session!.code, playerToken: session!.playerToken } : event;
    const sentFor = session?.code;
    const res = await transport.post<T>(body);
    if (needsSession && session?.code !== sentFor) return res; // left or switched room meanwhile

    if (res.network) {
      failures += 1;
      setConnection(failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting");
      return res;
    }
    if (!res.ok) {
      if (needsSession && SEAT_GONE.has(res.code)) {
        forget({ code: res.code, message: res.code === "room_not_found" ? "That room has closed." : res.message, action: event.type, at: now() });
      }
      return res;
    }
    failures = 0;
    if (running && session) setConnection("live");
    const data = res.data as Partial<JoinData & MeData & SubmitData> | undefined;
    if (data?.room) applyRoom(data.room);
    if (event.type === "room:me" && data && "clue" in data) update({ clue: data.clue ?? null });
    return res;
  }

  async function send(event: ClientEvent): Promise<GameResult> {
    const background = BACKGROUND.has(event.type);
    if (!background) update({ pending: event.type });
    if (event.type === "room:create" || event.type === "room:join") return join(event);

    const res = await request(event);
    if (!background) update({ pending: null });
    if (res.ok) {
      if (!background) update({ lastError: null });
      if (event.type === "puzzle:submit") {
        const d = res.data as SubmitData;
        update({
          lastSubmit: {
            puzzle: event.submission.puzzle,
            solved: d.solved,
            reason: d.reason,
            retryAt: d.retryAfterMs !== undefined ? now() + d.retryAfterMs : undefined,
            at: now(),
          },
        });
      }
      if (event.type === "room:leave") forget(null);
    } else if (!background && snap.room) {
      update({ lastError: errorFrom(event, res) });
    }
    return res;
  }

  async function join(event: Extract<ClientEvent, { type: "room:create" | "room:join" }>): Promise<GameResult> {
    const playerName = event.playerName.trim();
    let body: GameRequest = event;
    // Rejoining the stored room keeps the same seat (same token -> same player).
    if (event.type === "room:join" && session && session.code === event.code.trim().toUpperCase()) {
      body = { ...event, playerToken: session.playerToken };
    }
    const res = await transport.post<JoinData>(body);
    update({ pending: null, resuming: false });
    if (!res.ok) {
      update({ lastError: errorFrom(event, res), connection: res.network ? "offline" : snap.connection });
      return res;
    }
    const { code, playerId, playerToken, room } = res.data;
    saveSession({ code, playerId, playerToken, name: playerName });
    clueForPhase = null;
    update({ selfId: playerId, room: null, clue: null, lastError: null, lastSubmit: null, connection: "live" });
    applyRoom(room);
    if (running) startLoops();
    return res;
  }

  async function resume() {
    const stored = session;
    if (!stored) return update({ resuming: false });
    update({ resuming: true, connection: "connecting" });
    const res = await transport.post<JoinData>({ type: "room:join", code: stored.code, playerName: stored.name || "Player", playerToken: stored.playerToken });
    if (session !== stored) return; // user created/joined meanwhile
    if (res.ok) {
      const { code, playerId, playerToken, room } = res.data;
      saveSession({ code, playerId, playerToken, name: stored.name });
      update({ selfId: playerId, resuming: false });
      applyRoom(room);
      startLoops();
    } else if (res.network || res.code === "rate_limited" || res.code === "server_error") {
      // Keep the seat; polling and heartbeats will reconnect.
      update({ resuming: false });
      setConnection("reconnecting");
      startLoops();
    } else {
      forget({ code: res.code, message: res.code === "game_started" ? "Your seat in that mission is gone." : res.message, action: "room:join", at: now() });
    }
  }

  async function poll() {
    pollTimer = undefined;
    if (!running || !session) return;
    if (visibility?.hidden) return; // resumed by the visibilitychange listener
    const code = session.code;
    const res = await transport.view(code);
    if (!running || session?.code !== code) return;
    let wait = snap.room?.phase === "PUZZLE_2" ? Math.min(pollMs, FAST_POLL_INTERVAL_MS) : pollMs;
    if (res.ok) {
      failures = 0;
      setConnection("live");
      applyRoom(res.data.room);
    } else if (res.network) {
      failures += 1;
      setConnection(failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting");
      wait = Math.min(MAX_BACKOFF_MS, pollMs * 2 ** failures);
    } else if (res.code === "room_not_found") {
      return forget({ code: "room_not_found", message: "That room has closed.", action: "room:join", at: now() });
    } else if (res.retryAfterMs !== undefined) {
      wait = Math.max(pollMs, res.retryAfterMs);
    }
    schedulePoll(wait);
  }

  function schedulePoll(wait: number) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void poll(), wait);
  }

  const beat = () => {
    if (session && !visibility?.hidden) void request({ type: "player:heartbeat" });
  };

  function startLoops() {
    if (!running || !session) return;
    clearInterval(beatTimer);
    beatTimer = setInterval(beat, heartbeatMs);
    schedulePoll(0);
  }
  function stopLoops() {
    clearTimeout(pollTimer);
    clearInterval(beatTimer);
    pollTimer = beatTimer = undefined;
  }

  const onVisible = () => {
    if (!running || !session || visibility?.hidden) return;
    beat();
    schedulePoll(0);
  };
  const onOnline = () => {
    failures = 0;
    onVisible();
  };

  return {
    getSnapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    clearError: () => update({ lastError: null }),
    async refresh() {
      if (!session) return null;
      const code = session.code;
      const res = await transport.view(code);
      if (res.ok && session?.code === code) applyRoom(res.data.room);
      return snap.room;
    },
    start() {
      if (running) return;
      running = true;
      visibility?.addEventListener("visibilitychange", onVisible);
      if (typeof window !== "undefined") window.addEventListener("online", onOnline);
      if (snap.room) startLoops();
      else void resume();
    },
    stop() {
      running = false;
      stopLoops();
      visibility?.removeEventListener("visibilitychange", onVisible);
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    },
  };
}
