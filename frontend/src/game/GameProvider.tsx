import { useEffect, useState, type ReactNode } from "react";
import { createGameClient } from "./client";
import { API_ORIGIN, CLIENT_MODE, DEMO_BOTS } from "./config";
import { GameContext, type GameContextValue } from "./context";
import type { MockTransport } from "./mockTransport";
import { httpTransport, type Transport } from "./transport";

/** The local demo is loaded on demand, so production bundles never contain the engine or its answers. */
function lazyMockTransport(): Transport & Pick<MockTransport, "demoInfo"> {
  let loaded: MockTransport | null = null;
  const ready = import("./mockTransport").then((m) => (loaded = m.mockTransport(DEMO_BOTS)));
  return {
    mode: "mock",
    post: async (body) => (await ready).post(body),
    view: async (code) => (await ready).view(code),
    dispose: () => void ready.then((t) => t.dispose?.()),
    demoInfo: () => loaded?.demoInfo() ?? { bots: [] },
  };
}

function createValue(): GameContextValue {
  // Spelled out (not CLIENT_MODE) so production builds drop the mock chunk entirely.
  const mock = import.meta.env.VITE_GAME_CLIENT === "mock" || (import.meta.env.DEV && import.meta.env.VITE_GAME_CLIENT !== "live");
  if (mock && CLIENT_MODE === "mock") {
    const transport = lazyMockTransport();
    // No stored session: demo rooms exist only in this tab.
    return { client: createGameClient(transport, { storage: null }), demoInfo: transport.demoInfo };
  }
  return { client: createGameClient(httpTransport(API_ORIGIN)), demoInfo: null };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [value] = useState(createValue);
  useEffect(() => {
    value.client.start();
    return () => value.client.stop();
  }, [value]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
