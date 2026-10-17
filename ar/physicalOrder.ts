import {
  MARKER_IDS,
  PHYSICAL_ORDER,
  type DetectedMarker,
  type EvidenceSource,
  type MarkerId,
  type ObjectSighting,
  type Point,
  type PhysicalPuzzleResult,
} from "./types";

export const HOLD_DURATION_MS = 1200;
export const MAX_FRAME_GAP_MS = 500;
export const MAX_CENTER_DRIFT = 0.035;
export type OrderStatus =
  | "incomplete"
  | "duplicate"
  | "unaligned"
  | "wrong-order"
  | "unstable"
  | "holding"
  | "verified";
export type OrderReading = {
  status: OrderStatus;
  order: MarkerId[];
  progress: number;
  heldForMs: number;
};

/** Serializable camera evidence, usable before or after the hold completes. */
export function toCameraResult(
  markers: readonly (DetectedMarker | ObjectSighting)[],
  reading: OrderReading,
): PhysicalPuzzleResult {
  const evidence: Partial<Record<MarkerId, EvidenceSource>> = {};
  for (const marker of markers)
    evidence[marker.id] = "evidence" in marker ? marker.evidence : "qr";
  return {
    solved: reading.status === "verified",
    markers: [...markers],
    detectedIds: markers.map((marker) => marker.id),
    order: [...reading.order],
    source: "camera",
    heldForMs: reading.heldForMs,
    evidence,
  };
}

/**
 * Tuning per evidence type. QR corners are precise and decoded about 8 times a second; AI
 * boxes jitter more and arrive less often, so the AI scanner loosens the gap, drift and row
 * limits but asks for several fresh frames inside the same 1.2 s hold.
 */
export type TrackerOptions = {
  maxFrameGapMs: number;
  maxCenterDrift: number;
  maxRowSpread: number;
  minHoldFrames: number;
};
export const QR_TRACKER_OPTIONS: TrackerOptions = {
  maxFrameGapMs: MAX_FRAME_GAP_MS,
  maxCenterDrift: MAX_CENTER_DRIFT,
  maxRowSpread: 0.16,
  minHoldFrames: 1,
};

export function evaluateOrder(
  markers: readonly DetectedMarker[],
  maxRowSpread = QR_TRACKER_OPTIONS.maxRowSpread,
): Omit<OrderReading, "progress" | "heldForMs"> {
  const ordered = [...markers].sort((a, b) => a.center.x - b.center.x);
  const order = ordered.map((marker) => marker.id);
  if (new Set(order).size !== order.length)
    return { status: "duplicate", order };
  if (
    order.length !== MARKER_IDS.length ||
    MARKER_IDS.some((id) => !order.includes(id))
  )
    return { status: "incomplete", order };
  const ys = ordered.map((marker) => marker.center.y);
  const overlap = ordered.some((marker, i) => {
    if (i === 0) return false;
    const previous = ordered[i - 1];
    return (
      Math.min(...marker.corners.map((p) => p.x)) <=
      Math.max(...previous.corners.map((p) => p.x))
    );
  });
  if (Math.max(...ys) - Math.min(...ys) > maxRowSpread || overlap)
    return { status: "unaligned", order };
  if (order.some((id, i) => id !== PHYSICAL_ORDER[i]))
    return { status: "wrong-order", order };
  return { status: "holding", order };
}

/** A missed/wrong frame or a suspended tab resets the continuous verification window. */
export class PhysicalOrderTracker {
  private since: number | null = null;
  private lastFrame: number | null = null;
  private anchor: Map<MarkerId, Point> | null = null;
  private frames = 0; // fresh frames observed since the hold started
  private options: TrackerOptions;

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...QR_TRACKER_OPTIONS, ...options };
  }

  /** Changes tuning between frames (the AI scanner adapts the frame gap to device speed). */
  configure(options: Partial<TrackerOptions>) {
    this.options = { ...this.options, ...options };
  }

  reset() {
    this.since = null;
    this.lastFrame = null;
    this.anchor = null;
    this.frames = 0;
  }

  update(markers: readonly DetectedMarker[], now: number): OrderReading {
    const { maxFrameGapMs, maxCenterDrift, maxRowSpread, minHoldFrames } =
      this.options;
    const reading = evaluateOrder(markers, maxRowSpread);
    if (
      this.lastFrame !== null &&
      (now - this.lastFrame > maxFrameGapMs || now < this.lastFrame)
    )
      this.reset();
    this.lastFrame = now;
    if (reading.status !== "holding") {
      this.since = null;
      this.anchor = null;
      this.frames = 0;
      return { ...reading, progress: 0, heldForMs: 0 };
    }
    const moved =
      this.anchor !== null &&
      markers.some((marker) => {
        const previous = this.anchor!.get(marker.id)!;
        return (
          Math.hypot(
            marker.center.x - previous.x,
            marker.center.y - previous.y,
          ) > maxCenterDrift
        );
      });
    if (this.anchor === null || moved) {
      this.anchor = new Map(
        markers.map((marker) => [marker.id, { ...marker.center }]),
      );
      this.since = now;
      this.frames = 0;
    }
    this.frames += 1;
    if (moved)
      return { ...reading, status: "unstable", progress: 0, heldForMs: 0 };
    this.since ??= now;
    const heldForMs = Math.max(0, now - this.since);
    return {
      ...reading,
      status:
        heldForMs >= HOLD_DURATION_MS && this.frames >= minHoldFrames
          ? "verified"
          : "holding",
      progress: Math.min(1, heldForMs / HOLD_DURATION_MS),
      heldForMs,
    };
  }
}
