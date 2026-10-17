import {
  MARKER_IDS,
  PHYSICAL_ORDER,
  type DetectedMarker,
  type MarkerId,
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
  markers: readonly DetectedMarker[],
  reading: OrderReading,
): PhysicalPuzzleResult {
  return {
    solved: reading.status === "verified",
    markers: [...markers],
    detectedIds: markers.map((marker) => marker.id),
    order: [...reading.order],
    source: "camera",
    heldForMs: reading.heldForMs,
  };
}

export function evaluateOrder(
  markers: readonly DetectedMarker[],
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
  if (Math.max(...ys) - Math.min(...ys) > 0.16 || overlap)
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

  reset() {
    this.since = null;
    this.lastFrame = null;
    this.anchor = null;
  }

  update(markers: readonly DetectedMarker[], now: number): OrderReading {
    const reading = evaluateOrder(markers);
    if (
      this.lastFrame !== null &&
      (now - this.lastFrame > MAX_FRAME_GAP_MS || now < this.lastFrame)
    )
      this.reset();
    this.lastFrame = now;
    if (reading.status !== "holding") {
      this.since = null;
      this.anchor = null;
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
          ) > MAX_CENTER_DRIFT
        );
      });
    if (this.anchor === null || moved) {
      this.anchor = new Map(
        markers.map((marker) => [marker.id, { ...marker.center }]),
      );
      this.since = now;
    }
    if (moved)
      return { ...reading, status: "unstable", progress: 0, heldForMs: 0 };
    this.since ??= now;
    const heldForMs = Math.max(0, now - this.since);
    return {
      ...reading,
      status: heldForMs >= HOLD_DURATION_MS ? "verified" : "holding",
      progress: Math.min(1, heldForMs / HOLD_DURATION_MS),
      heldForMs,
    };
  }
}
