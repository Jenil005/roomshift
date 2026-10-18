import { useMemo } from "react";
import type { ClientSnapshot, GameClient } from "../game/GameClient";
import { GameContext } from "../game/context";
import { Failed } from "../screens/Failed";
import { Lobby } from "../screens/Lobby";
import { Puzzle1 } from "../screens/Puzzle1";
import type { Room } from "@shared/types";

export type DevScreen = "lobby" | "puzzle1" | "gameover";

const now = Date.now();
const previewRoom: Room = {
  code: "DEV1",
  phase: "LOBBY",
  players: [
    { id: "dev-player", name: "Reagan", isHost: true, isReady: false, connected: true },
    { id: "dev-player-2", name: "Maya", isHost: false, isReady: true, connected: true },
  ],
  createdAt: now,
  hostId: "dev-player",
  missionId: "dev-preview",
  phaseStartedAt: now,
  systems: { breaker: false, terminal: false, door: false },
  puzzles: { 1: { solved: false, attempts: 0 }, 2: { solved: false, attempts: 0 } },
  version: 1,
  events: [],
};

/** Renders real app screens against throwaway local fixture state for visual checks. */
export function DevScreenPreview({ screen }: { screen: DevScreen }) {
  const snapshot = useMemo<ClientSnapshot>(() => ({
    mode: "mock",
    room: screen === "gameover" ? null : { ...previewRoom, phase: screen === "lobby" ? "LOBBY" : "PUZZLE_1" },
    selfId: "dev-player",
    clue: screen === "puzzle1" ? { playerId: "dev-player", role: "engineer", text: "Knowledge is scanned first. Access is scanned last.", clues: ["Knowledge is scanned first.", "Access is scanned last."] } : null,
    connection: "idle",
    resuming: false,
    pending: null,
    lastError: screen === "gameover" ? {
      code: "room_not_found",
      message: "The room has closed.",
      action: "room:join",
      at: now,
    } : null,
    lastSubmit: null,
    scans: { pending: [], last: null },
    serverTimeOffset: 0,
  }), [screen]);

  const value = useMemo(() => {
    const client: GameClient = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      send: async () => ({ ok: true, data: {} }),
      clearError: () => {},
      refresh: async () => snapshot.room,
      scanObject: () => {},
      restartScans: async () => ({ ok: true, data: {} }),
      start: () => {},
      stop: () => {},
    };
    return { client, demoInfo: null };
  }, [snapshot]);

  return (
    <GameContext.Provider value={value}>
      {screen === "lobby" ? <Lobby /> : screen === "puzzle1" ? <Puzzle1 preview /> : <Failed />}
    </GameContext.Provider>
  );
}
