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
