// TODO (backend teammate): implement GameClient on top of DeepSpace.
// The UI is already built against GameClient, so nothing in screens/ should need to change.
//
// Responsibilities:
//  - send(action): forward the ClientAction to the server (never decide outcomes here).
//  - subscribe/getSnapshot: keep the latest public GameState plus THIS player's private
//    RoleBriefing (the server must only send each player their own briefing).
//  - serverTimeOffset: estimate serverNow - Date.now() on connect, so every phone's
//    life bar drains in sync from the shared deadline.
//  - getSnapshot must return the same object until something changes (React relies on it).
import type { GameClient } from "./GameClient";

export function createDeepSpaceClient(): GameClient {
  throw new Error("DeepSpace client not implemented yet. Set VITE_GAME_CLIENT=mock.");
}
