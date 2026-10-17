import { useContext, useSyncExternalStore } from "react";
import type { ClientEvent, GameResult } from "@shared/events";
import type { ClientSnapshot, GameClient } from "./GameClient";
import { GameContext, type GameContextValue } from "./context";

export function useGameContext(): GameContextValue {
  const c = useContext(GameContext);
  if (!c) throw new Error("useGame must be used inside <GameProvider>");
  return c;
}

export function useGameClient(): GameClient {
  return useGameContext().client;
}

export type GameView = ClientSnapshot & {
  send: (event: ClientEvent) => Promise<GameResult>;
  clearError: () => void;
};

export function useGame(): GameView {
  const client = useGameClient();
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { ...snap, send: client.send, clearError: client.clearError };
}

/** The current player's public entry, if any. */
export function useMe() {
  const { room, selfId } = useGame();
  return room?.players.find((p) => p.id === selfId) ?? null;
}
