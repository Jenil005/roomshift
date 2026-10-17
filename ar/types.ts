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

// --- Marker scanner (PhysicalPuzzle / detectMarkers / physicalOrder) ---

export const MARKER_IDS = ["BOOK", "CUP", "KEYS"] as const;
export type MarkerId = (typeof MARKER_IDS)[number];
export type Point = { x: number; y: number };

/** Coordinates are normalized to the unmirrored camera image. */
export type DetectedMarker = {
  id: MarkerId;
  center: Point;
  corners: [Point, Point, Point, Point];
};

/** Client evidence only. The authoritative game server must validate submissions. */
export type PhysicalPuzzleResult = {
  solved: boolean;
  markers: DetectedMarker[];
  detectedIds: MarkerId[];
  order: MarkerId[];
  source: "camera" | "manual";
  heldForMs: number;
};

export const PHYSICAL_ORDER: readonly MarkerId[] = ["BOOK", "CUP", "KEYS"];
export const MARKER_PREFIX = "ROOMSHIFT:";
