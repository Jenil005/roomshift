import { OBJECT_IDS } from "../shared/constants";
import type { ObjectId } from "../shared/types";

// Marker id == object id (shared/constants OBJECT_IDS). The server matches ids case-insensitively.
export const MARKER_IDS = OBJECT_IDS;
export type MarkerId = ObjectId;
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

export const PHYSICAL_ORDER: readonly MarkerId[] = ["book", "cup", "keys"];
// Printed QR tag payload: exactly roomshift:v1:<objectId> (docs/AR_AGENT.md section 6).
export const TAG_PREFIX = "roomshift:v1:";
export const MARKER_LABEL: Record<MarkerId, string> = {
  book: "BOOK",
  cup: "CUP",
  keys: "KEYS",
};

export type ScanErrorCode =
  | "denied"
  | "no-camera"
  | "insecure-context"
  | "unknown";

/** Camera QR scanning. A scan is UI feedback only; the server validates every submission. */
export interface ScanSession {
  start(video: HTMLVideoElement): Promise<void>; // asks for camera permission
  stop(): void; // releases the camera
  onScan(cb: (objectId: MarkerId) => void): void;
  onError(cb: (e: { code: ScanErrorCode }) => void): void;
}

// ----- Shared AR room (room/, sync/, templates/) -----

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
