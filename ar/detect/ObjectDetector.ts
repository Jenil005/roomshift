import type { MarkerId } from "../types";
import type { RawDetection } from "./objectClasses";

export type DetectorErrorCode = "unsupported" | "model-failed" | "timeout";

export class DetectorError extends Error {
  readonly code: DetectorErrorCode;

  constructor(code: DetectorErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "DetectorError";
  }
}

/**
 * Any on-device object detector. COCO-SSD implements it today; a MediaPipe Object Detector
 * with a custom model (for example one that knows "keys") can implement the same interface
 * and declare the extra class in `classMap`.
 */
export interface ObjectDetector {
  readonly name: string;
  /** Detector class name -> puzzle object id. Unlisted classes are shown but never used. */
  readonly classMap: Readonly<Record<string, MarkerId>>;
  /** Detects objects in one frame. Boxes are in pixels of `frame`. */
  detect(frame: HTMLCanvasElement): Promise<RawDetection[]>;
}
