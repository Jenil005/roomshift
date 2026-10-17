// AR module types. The AR agent owns ar/**; keep this independent of game-engine code.

export type SystemId = "breaker" | "terminal" | "door";

// Restore order used for hints and demo rules. Real gating belongs to the DeepSpace backend.
export const SYSTEM_ORDER: SystemId[] = ["breaker", "terminal", "door"];

// Everything both devices need to render the same room. Keep it small and serializable.
export interface RoomState {
  version: number; // increases on every change; clients ignore older versions
  systems: Record<SystemId, boolean>; // true = restored / online
}

export const initialRoomState = (): RoomState => ({
  version: 0,
  systems: { breaker: false, terminal: false, door: false },
});

// Where another player is looking (they all stand at the room center).
export interface PeerPresence {
  id: string;
  name: string;
  yaw: number;
  pitch: number;
  updatedAt: number;
}
