import type { ClientAction, ClientSnapshot } from "../shared/types";

/**
 * The only thing the UI knows about networking.
 * mockClient implements it locally; the DeepSpace adapter implements it for real.
 */
export interface GameClient {
  getSnapshot(): ClientSnapshot;
  subscribe(listener: () => void): () => void;
  send(action: ClientAction): void;
}
