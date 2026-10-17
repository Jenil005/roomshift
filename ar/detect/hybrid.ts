import {
  MARKER_IDS,
  type DetectedMarker,
  type EvidenceSource,
  type MarkerId,
  type ObjectSighting,
} from "../types";

/**
 * AI mode evidence for one frame: AI sightings for the objects the model knows, plus QR tags
 * only for the objects it cannot see (`qrIds`, i.e. KEYS with COCO-SSD). QR tags for the
 * AI-detectable objects are ignored here, so each object has exactly one evidence source.
 */
export function mergeHybrid(
  ai: readonly ObjectSighting[],
  qr: readonly DetectedMarker[],
  qrIds: readonly MarkerId[],
): ObjectSighting[] {
  const fromQr: ObjectSighting[] = qr
    .filter((marker) => qrIds.includes(marker.id))
    .map((marker) => ({ ...marker, evidence: "qr" }));
  return [...ai.filter((s) => !qrIds.includes(s.id)), ...fromQr];
}

/** Evidence source per object in this frame (first sighting wins for duplicates). */
export function evidenceById(
  sightings: readonly ObjectSighting[],
): Partial<Record<MarkerId, EvidenceSource>> {
  const out: Partial<Record<MarkerId, EvidenceSource>> = {};
  for (const s of sightings) out[s.id] ??= s.evidence;
  return out;
}

/**
 * Guard used before an AI-mode result is reported: every object must be present, and AI
 * alone is never enough. At least one object must come from a non-AI source (the QR tag).
 */
export function hybridEvidenceAccepted(
  sightings: readonly ObjectSighting[],
): boolean {
  const evidence = evidenceById(sightings);
  if (!MARKER_IDS.every((id) => evidence[id] !== undefined)) return false;
  return MARKER_IDS.some((id) => evidence[id] !== "ai");
}

/** A sighting as the UI shows it: fresh this frame, or briefly remembered after a miss. */
export type TrackedSighting = ObjectSighting & {
  stale: boolean;
  firstSeen: number;
  lastSeen: number;
  hits: number;
};

// Max normalized center distance for two frames' sightings to be the same physical object.
const MATCH_DISTANCE = 0.25;

/**
 * Follows objects across successive inference results so labels and the detected/missing
 * chips do not flicker when one inference misses. Remembered (stale) sightings are for
 * display only: callers must feed the arrangement check with the current frame's sightings.
 */
export class SightingTracker {
  private tracks: TrackedSighting[] = [];

  private rememberMs: number;

  constructor(rememberMs = 800) {
    this.rememberMs = rememberMs;
  }

  reset() {
    this.tracks = [];
  }

  update(sightings: readonly ObjectSighting[], now: number): TrackedSighting[] {
    const previous = this.tracks.filter((t) => now >= t.lastSeen);
    const next: TrackedSighting[] = [];
    for (const s of sightings) {
      let best = -1;
      let bestDistance = MATCH_DISTANCE;
      previous.forEach((t, i) => {
        if (t.id !== s.id || t.evidence !== s.evidence) return;
        const d = Math.hypot(t.center.x - s.center.x, t.center.y - s.center.y);
        if (d <= bestDistance) {
          best = i;
          bestDistance = d;
        }
      });
      const match = best >= 0 ? previous.splice(best, 1)[0] : undefined;
      next.push({
        ...s,
        stale: false,
        firstSeen: match?.firstSeen ?? now,
        lastSeen: now,
        hits: (match?.hits ?? 0) + 1,
      });
    }
    for (const t of previous)
      if (now - t.lastSeen <= this.rememberMs) next.push({ ...t, stale: true });
    this.tracks = next;
    return next;
  }
}

// The AI frame gap allows ~3 inference cycles, so one slow inference does not reset a valid
// hold, but a stalled camera or model (over 2.5 s without a fresh frame) always does.
export const AI_MIN_FRAME_GAP_MS = 1000;
export const AI_MAX_FRAME_GAP_MS = 2500;

/** Max allowed gap between fresh AI frames, from the measured time between frames. */
export function adaptiveFrameGap(frameIntervalMs: number): number {
  if (!Number.isFinite(frameIntervalMs) || frameIntervalMs <= 0)
    return AI_MIN_FRAME_GAP_MS;
  return Math.min(
    AI_MAX_FRAME_GAP_MS,
    Math.max(AI_MIN_FRAME_GAP_MS, Math.round(frameIntervalMs * 3)),
  );
}

/** Smoothed time between frames (exponential moving average, single intervals capped). */
export class FrameIntervalMeter {
  private last: number | null = null;
  private average = 0;

  /** Smoothed interval in ms; 0 until two frames were seen. */
  get interval() {
    return this.average;
  }

  reset() {
    this.last = null;
    this.average = 0;
  }

  /** Records a frame's capture time. */
  sample(at: number) {
    const previous = this.last;
    this.last = at;
    if (previous === null || at <= previous) return;
    const interval = Math.min(at - previous, 10_000);
    this.average =
      this.average === 0 ? interval : this.average * 0.7 + interval * 0.3;
  }
}
