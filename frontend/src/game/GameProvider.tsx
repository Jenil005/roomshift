import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { GameClient } from "./GameClient";
import type { ClientAction, ClientSnapshot } from "../shared/types";
import { createMockClient } from "./mockClient";
import { createDeepSpaceClient } from "./deepspaceClient";

const GameContext = createContext<GameClient | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (import.meta.env.VITE_GAME_CLIENT === "deepspace" ? createDeepSpaceClient() : createMockClient()),
    []
  );
  return <GameContext.Provider value={client}>{children}</GameContext.Provider>;
}

export function useGameClient(): GameClient {
  const c = useContext(GameContext);
  if (!c) throw new Error("useGame must be used inside <GameProvider>");
  return c;
}

export function useGame(): ClientSnapshot & { send: (a: ClientAction) => void } {
  const client = useGameClient();
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { ...snap, send: client.send };
}
