import jsQR from "jsqr";
import {
  MARKER_IDS,
  MARKER_PREFIX,
  type DetectedMarker,
  type MarkerId,
} from "./types";

/** Decode separate QR cards in one frame, without uploading images. */
export function detectMarkers(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedMarker[] {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4)
    return [];
  const working = new Uint8ClampedArray(pixels);
  const markers: DetectedMarker[] = [];
  // jsQR's single-code locator can mix finder patterns from adjacent cards.
  // Search overlapping strips at two scales, then the full image. Mask decoded
  // codes globally so overlapping regions don't report the same physical card.
  const regions = [
    [0, 1 / 3],
    [1 / 3, 2 / 3],
    [2 / 3, 1],
    [0, 0.5],
    [0.25, 0.75],
    [0.5, 1],
    [0, 1],
  ];
  let decodedCount = 0;
  for (const [start, end] of regions) {
    const left = Math.floor(start * width);
    const regionWidth = Math.floor(end * width) - left;
    if (regionWidth < 1) continue;
    while (decodedCount < 8) {
      const crop = new Uint8ClampedArray(regionWidth * height * 4);
      for (let y = 0; y < height; y += 1) {
        const offset = (y * width + left) * 4;
        crop.set(
          working.subarray(offset, offset + regionWidth * 4),
          y * regionWidth * 4,
        );
      }
      const code = jsQR(crop, regionWidth, height, {
        inversionAttempts: "dontInvert",
      });
      if (!code) break;
      decodedCount += 1;
      const {
        topLeftCorner,
        topRightCorner,
        bottomRightCorner,
        bottomLeftCorner,
      } = code.location;
      const corners = [
        topLeftCorner,
        topRightCorner,
        bottomRightCorner,
        bottomLeftCorner,
      ].map((p) => ({ x: p.x + left, y: p.y }));
      const id = code.data.startsWith(MARKER_PREFIX)
        ? code.data.slice(MARKER_PREFIX.length)
        : "";
      if (MARKER_IDS.includes(id as MarkerId)) {
        const normalized = corners.map(({ x, y }) => ({
          x: x / width,
          y: y / height,
        })) as DetectedMarker["corners"];
        markers.push({
          id: id as MarkerId,
          center: {
            x: normalized.reduce((sum, p) => sum + p.x, 0) / 4,
            y: normalized.reduce((sum, p) => sum + p.y, 0) / 4,
          },
          corners: normalized,
        });
      }
      const minX = Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.x))) - 2,
      );
      const maxX = Math.min(
        width - 1,
        Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
      );
      const minY = Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.y))) - 2,
      );
      const maxY = Math.min(
        height - 1,
        Math.ceil(Math.max(...corners.map((p) => p.y))) + 2,
      );
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const offset = (y * width + x) * 4;
          working[offset] = working[offset + 1] = working[offset + 2] = 255;
          working[offset + 3] = 255;
        }
      }
    }
  }
  return markers;
}
