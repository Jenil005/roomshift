import type { ClientMode } from "./GameClient";

/**
 * Production builds talk to the real backend. `npm run dev` defaults to the local demo
 * (in-tab engine + bots) unless VITE_GAME_CLIENT=live. Nothing falls back silently.
 */
export const CLIENT_MODE: ClientMode =
  import.meta.env.VITE_GAME_CLIENT === "mock" || import.meta.env.VITE_GAME_CLIENT === "live"
    ? import.meta.env.VITE_GAME_CLIENT
    : import.meta.env.DEV
      ? "mock"
      : "live";

/** Origin of the DeepSpace game API. No secrets: the API is public and token-based. */
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN || "https://roomshift.app.space";

/** Number of local-demo bots (?bots=1..3). */
export const DEMO_BOTS = Math.max(1, Math.min(3, Number(new URLSearchParams(location.search).get("bots") ?? 2) || 2));
