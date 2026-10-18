import { PUZZLE1_SCAN_MIN_CONFIDENCE } from "../../shared/constants";
import {
  MARKER_IDS,
  type MarkerId,
  type ObjectScanReport,
  type ObjectSighting,
} from "../types";
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
// cover in our tests), so books get a lower bar for display; cups score high, so they get a
// higher one. A scan that counts for the puzzle also needs SCAN_MIN_CONFIDENCE (below).
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

// A single frame marks an object scanned for good (no hold filters out a flicker), so the
// scan bar is higher than the display bar. COCO-SSD values; not yet tuned on an iPhone.
export const AI_SCAN_CONFIDENCE: ConfidenceThresholds = {
  default: 0.55,
  book: 0.5,
  cup: 0.6,
};
// The server refuses AI scans below this floor, whatever the detector.
export const SCAN_MIN_CONFIDENCE = PUZZLE1_SCAN_MIN_CONFIDENCE;

export function scanScoreFor(
  label: string,
  scanThresholds: ConfidenceThresholds = AI_SCAN_CONFIDENCE,
): number {
  return Math.max(minScoreFor(label, scanThresholds), SCAN_MIN_CONFIDENCE);
}

/**
 * Sightings in one frame that are strong enough to mark their object scanned: AI sightings
 * at or above scanScoreFor(label), or a decoded QR tag. The best sighting per object wins.
 * Pass the detector's own scanThresholds: scores are not comparable across models.
 */
export function scanCandidates(
  sightings: readonly ObjectSighting[],
  scanThresholds: ConfidenceThresholds = AI_SCAN_CONFIDENCE,
): ObjectScanReport[] {
  const best = new Map<MarkerId, ObjectScanReport>();
  for (const s of sightings) {
    if (s.evidence === "ai") {
      const score = s.score;
      if (score === undefined || !Number.isFinite(score)) continue;
      if (score < scanScoreFor(s.label ?? s.id, scanThresholds)) continue;
      const current = best.get(s.id);
      if (!current || (current.evidence === "ai" && (current.score ?? 0) < score))
        best.set(s.id, { id: s.id, evidence: "ai", score });
    } else if (!best.has(s.id)) {
      best.set(s.id, { id: s.id, evidence: "qr" });
    }
  }
  return MARKER_IDS.flatMap((id) => best.get(id) ?? []);
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
