import { MARKER_IDS, type MarkerId, type ObjectSighting } from "../types";
import { bboxToMarker, iou, type PixelBox } from "./geometry";

/** One raw detector output, in pixels of the frame that was passed to the detector. */
export type RawDetection = { label: string; score: number; bbox: PixelBox };

/** A detection of a class the puzzle does not use (shown dimmed so players see what the model sees). */
export type OtherSighting = {
  label: string;
  score: number;
  center: { x: number; y: number };
  corners: ObjectSighting["corners"];
};

// COCO class labels include book, cup and keyboard, so all three are AI-detectable.
export const COCO_CLASS_MAP: Readonly<Record<string, MarkerId>> = {
  book: "book",
  cup: "cup",
  keyboard: "keyboard",
};

/** Minimum score per detector class; `default` applies to every other class. */
export type ConfidenceThresholds = Readonly<Record<string, number>> & {
  readonly default: number;
};
// COCO-SSD's own default is 0.5. COCO-SSD lite scores real books low (0.45-0.55 for a clear
// cover in our tests), so books get a lower bar; cups score high, so they get a higher one.
// The 1.2 s hold, the order check and the KEYS QR tag still have to pass on top of this.
export const AI_CONFIDENCE: ConfidenceThresholds = {
  default: 0.5,
  book: 0.45,
  cup: 0.55,
};

export function minScoreFor(
  label: string,
  thresholds: ConfidenceThresholds = AI_CONFIDENCE,
): number {
  return Object.hasOwn(thresholds, label) ? thresholds[label] : thresholds.default;
}

// Two boxes of the same object overlapping this much are one detection, not a duplicate.
export const DUPLICATE_IOU = 0.5;

/** Objects a detector with this class map can see. */
export function aiDetectableIds(
  classMap: Readonly<Record<string, MarkerId>>,
): MarkerId[] {
  const mapped = new Set(Object.values(classMap));
  return MARKER_IDS.filter((id) => mapped.has(id));
}

/** Objects that need another kind of evidence (a QR tag) when using this class map. */
export function qrOnlyIds(
  classMap: Readonly<Record<string, MarkerId>>,
): MarkerId[] {
  const ai = aiDetectableIds(classMap);
  return MARKER_IDS.filter((id) => !ai.includes(id));
}

/**
 * Turns raw detector output into normalized puzzle sightings.
 * - drops anything below its class threshold
 * - maps class names to object ids; unmapped classes go to `others`
 * - merges overlapping boxes of the same object (keeps the higher score)
 * Separate, non-overlapping boxes of the same object are kept, so the order check can report
 * "duplicate" instead of guessing which one the players meant.
 */
export function mapDetections(
  raw: readonly RawDetection[],
  frameWidth: number,
  frameHeight: number,
  classMap: Readonly<Record<string, MarkerId>> = COCO_CLASS_MAP,
  thresholds: ConfidenceThresholds = AI_CONFIDENCE,
): { sightings: ObjectSighting[]; others: OtherSighting[] } {
  const sightings: ObjectSighting[] = [];
  const others: OtherSighting[] = [];
  const sorted = [...raw]
    .filter(
      (d) =>
        Number.isFinite(d.score) && d.score >= minScoreFor(d.label, thresholds),
    )
    .sort((a, b) => b.score - a.score);
  for (const detection of sorted) {
    const shape = bboxToMarker(detection.bbox, frameWidth, frameHeight);
    if (!shape) continue;
    const id = Object.hasOwn(classMap, detection.label)
      ? classMap[detection.label]
      : undefined;
    if (!id) {
      others.push({ label: detection.label, score: detection.score, ...shape });
      continue;
    }
    const merged = sightings.some(
      (s) => s.id === id && iou(s.corners, shape.corners) > DUPLICATE_IOU,
    );
    if (merged) continue; // sorted by score, so the kept box is the stronger one
    sightings.push({
      id,
      ...shape,
      evidence: "ai",
      score: detection.score,
      label: detection.label,
    });
  }
  return { sightings, others };
}
