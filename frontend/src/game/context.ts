import { createContext } from "react";
import type { GameClient } from "./GameClient";
import type { MockDemoInfo } from "./mockTransport";

export interface GameContextValue {
  client: GameClient;
  /** Local demo only: bot teammates' clues. null in live mode. */
  demoInfo: (() => MockDemoInfo) | null;
}

export const GameContext = createContext<GameContextValue | null>(null);
