import { loadCocoSsdDetector, releaseCocoSsdDetector } from "./cocoSsdDetector";
import { loadMediaPipeDetector, releaseMediaPipeDetector } from "./mediapipeDetector";
import type { ObjectDetector } from "./ObjectDetector";

export type DetectorPreference = "auto" | "mediapipe" | "coco";

/**
 * Default: COCO-SSD, the detector the AR team tuned and tested, which also scored higher on
 * our test photos. MediaPipe works (see MEDIAPIPE_CONFIDENCE) but is not validated on an
 * iPhone yet; switch this to "auto" once /diagnostics.html shows it is at least as good there.
 */
export const DEFAULT_DETECTOR: DetectorPreference = "coco";

/** `?detector=coco|mediapipe|auto` overrides the default (auto: MediaPipe, then COCO-SSD). */
export function detectorPreference(search = typeof location === "undefined" ? "" : location.search): DetectorPreference {
  const value = new URLSearchParams(search).get("detector");
  return value === "coco" || value === "mediapipe" || value === "auto" ? value : DEFAULT_DETECTOR;
}

/**
 * One detector at a time, never both. "auto": MediaPipe first when supported (it must load and
 * pass a warm-up inference), otherwise COCO-SSD. The losing detector is released before the other
 * loads, so two GPU-heavy models never sit in memory together.
 */
export async function loadPreferredDetector(
  preference: DetectorPreference = detectorPreference(),
  loaders = { mediapipe: loadMediaPipeDetector, coco: loadCocoSsdDetector },
): Promise<ObjectDetector> {
  if (preference === "coco") return loaders.coco();
  try {
    return await loaders.mediapipe();
  } catch (error) {
    releaseMediaPipeDetector();
    if (preference === "mediapipe") throw error;
    console.warn("MediaPipe unavailable, using COCO-SSD:", error);
    return loaders.coco();
  }
}

/** Frees whichever detector is loaded (safe to call any time). */
export function releaseDetectors() {
  releaseMediaPipeDetector();
  releaseCocoSsdDetector();
}
