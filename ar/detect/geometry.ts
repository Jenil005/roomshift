import type { DetectedMarker, Point } from "../types";

/** [x, y, width, height] in pixels, top-left origin (COCO-SSD's bbox format). */
export type PixelBox = [number, number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Converts a pixel box to normalized center + corners (clockwise from top-left), clamped to
 * the frame. Returns null for empty or invalid boxes.
 */
export function bboxToMarker(
  [x, y, width, height]: PixelBox,
  frameWidth: number,
  frameHeight: number,
): Pick<DetectedMarker, "center" | "corners"> | null {
  if (
    !(frameWidth > 0 && frameHeight > 0) ||
    ![x, y, width, height].every(Number.isFinite)
  )
    return null;
  const left = clamp01(x / frameWidth);
  const top = clamp01(y / frameHeight);
  const right = clamp01((x + width) / frameWidth);
  const bottom = clamp01((y + height) / frameHeight);
  if (right <= left || bottom <= top) return null;
  return {
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
    corners: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}

function extent(corners: readonly Point[]) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** Intersection over union of two quads' bounding rectangles. */
export function iou(a: readonly Point[], b: readonly Point[]): number {
  const A = extent(a);
  const B = extent(b);
  const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
  const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union =
    (A.right - A.left) * (A.bottom - A.top) +
    (B.right - B.left) * (B.bottom - B.top) -
    inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Maps a point normalized to the video image onto the element showing it, for
 * `object-fit: cover` (the image is scaled to fill and the overflow is cropped). With
 * `object-fit: contain`-like sizing where aspect ratios match, this is the identity.
 */
export function coverTransform(
  videoWidth: number,
  videoHeight: number,
  elementWidth: number,
  elementHeight: number,
): (p: Point) => Point {
  if (!(videoWidth > 0 && videoHeight > 0 && elementWidth > 0 && elementHeight > 0))
    return (p) => p;
  const scale = Math.max(elementWidth / videoWidth, elementHeight / videoHeight);
  const shownWidth = videoWidth * scale;
  const shownHeight = videoHeight * scale;
  const offsetX = (shownWidth - elementWidth) / 2;
  const offsetY = (shownHeight - elementHeight) / 2;
  return (p) => ({
    x: (p.x * shownWidth - offsetX) / elementWidth,
    y: (p.y * shownHeight - offsetY) / elementHeight,
  });
}
