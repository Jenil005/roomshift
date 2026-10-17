import type { PeerPresence, RoomState, SystemId } from "../types";

// The only thing the AR scene knows about networking. Swap LocalSync for a DeepSpace-backed
// implementation without touching RoomScene.
export interface RoomSync {
  readonly isHost: boolean;
  readonly playerId: string;
  start(): void;
  stop(): void;
  onState(cb: (s: RoomState) => void): void;
  onPeers(cb: (p: PeerPresence[]) => void): void;
  onNotice(cb: (msg: string) => void): void;
  interact(id: SystemId): void; // request: the authority decides if it succeeds
  sendPresence(yaw: number, pitch: number): void;
  reset?(): void;
}
