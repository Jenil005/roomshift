import { reportDebug } from "../debugChannel";
import type { AiFrame } from "./AiScanSession";
import { AI_MIN_INTERVAL_MS } from "./AiScanSession";
import { mapDetections } from "./objectClasses";
import type { ObjectDetector } from "./ObjectDetector";

/** RGBA camera pixels, e.g. one XR8 CameraPixelArray frame. */
export type PixelFrame = { rows: number; cols: number; rowBytes: number; pixels: Uint8Array };

/**
 * Runs the object detector on camera frames someone else captures (the AR engine during
 * AR), instead of opening a camera itself. Frames arrive at the camera rate; at most one
 * inference runs at a time and at most about 4 per second, like AiScanSession. Frames are
 * processed in memory and discarded. `flipRows` turns a bottom-up frame upright.
 */
export class CameraFrameScanner {
  readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d");
  private busy = false;
  private stopped = false;
  private lastStart = -Infinity;
  private readonly detector: ObjectDetector;
  private readonly onFrame: (frame: AiFrame) => void;
  private readonly options: { minIntervalMs: number; flipRows: boolean; now: () => number };

  constructor(
    detector: ObjectDetector,
    onFrame: (frame: AiFrame) => void,
    options: Partial<{ minIntervalMs: number; flipRows: boolean; now: () => number }> = {},
  ) {
    this.detector = detector;
    this.onFrame = onFrame;
    this.options = {
      minIntervalMs: options.minIntervalMs ?? AI_MIN_INTERVAL_MS,
      flipRows: options.flipRows ?? false,
      now: options.now ?? (() => performance.now()),
    };
  }

  /** Offers one frame. Dropped while an inference runs or if the last one started too recently. */
  push(frame: PixelFrame): boolean {
    if (this.stopped || this.busy || !this.context) return false;
    const at = this.options.now();
    if (at - this.lastStart < this.options.minIntervalMs) return false;
    const { rows, cols, rowBytes, pixels } = frame;
    if (rows <= 0 || cols <= 0 || rowBytes < cols * 4 || pixels.length < rowBytes * rows) return false;
    this.busy = true;
    this.lastStart = at;
    // Copy into the canvas (row by row: rows may be padded, and may need flipping).
    const image = new ImageData(cols, rows);
    for (let y = 0; y < rows; y++) {
      const src = (this.options.flipRows ? rows - 1 - y : y) * rowBytes;
      image.data.set(pixels.subarray(src, src + cols * 4), y * cols * 4);
    }
    if (this.canvas.width !== cols) this.canvas.width = cols;
    if (this.canvas.height !== rows) this.canvas.height = rows;
    this.context.putImageData(image, 0, 0);
    void this.detector
      .detect(this.canvas)
      .then((raw) => {
        if (this.stopped) return;
        const inferenceMs = this.options.now() - at;
        reportDebug({ inferenceMs });
        const { sightings, others } = mapDetections(raw, cols, rows, this.detector.classMap, this.detector.thresholds);
        this.onFrame({ sightings, others, at, inferenceMs, frameWidth: cols, frameHeight: rows });
      })
      .catch(() => {
        // One failed inference skips this frame; the next frame tries again.
      })
      .finally(() => {
        this.busy = false;
      });
    return true;
  }

  stop() {
    this.stopped = true;
    this.canvas.width = this.canvas.height = 0; // drop the last frame's pixels
  }
}
