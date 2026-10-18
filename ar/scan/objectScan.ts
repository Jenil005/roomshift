import {
  MARKER_IDS,
  MARKER_LABEL,
  PHYSICAL_ORDER,
  type MarkerId,
  type ObjectScanReport,
} from "../types";

/**
 * Sequential object scanning: each object is scanned on its own and stays scanned. These
 * helpers are pure so the scanner, the game host and the tests share one set of rules.
 * Local feedback only: with a game server, the server decides what counts.
 */

export const SCAN_COMPLETE_TEXT = "BREAKER RESTORED — PUZZLE COMPLETE";
export const VERIFYING_TEXT = "VERIFYING SEQUENCE";

/** What one camera frame means for scan progress. */
export type FrameDecision =
  | { kind: "report"; scan: ObjectScanReport } // exactly one new object: record it
  | { kind: "duplicate"; id: MarkerId } // only already-scanned objects in view
  | { kind: "crowded"; ids: MarkerId[] } // several new objects at once: ask for one
  | { kind: "none" };

/**
 * `candidates` are this frame's sightings strong enough to count (scanCandidates). Objects
 * already in `scanned` never count twice. When two or more new objects are in view at once
 * nothing is recorded, so a crowded frame cannot scan them in an accidental order.
 */
export function decideFrame(
  candidates: readonly ObjectScanReport[],
  scanned: readonly MarkerId[],
): FrameDecision {
  const fresh = candidates.filter((c) => !scanned.includes(c.id));
  if (fresh.length === 1) return { kind: "report", scan: fresh[0] };
  if (fresh.length > 1) return { kind: "crowded", ids: fresh.map((c) => c.id) };
  const seen = candidates.find((c) => scanned.includes(c.id));
  return seen ? { kind: "duplicate", id: seen.id } : { kind: "none" };
}

/** "BOOK SCANNED ✓ — FIND THE CUP" after the newest scan in `scanned`. */
export function scannedText(id: MarkerId, scanned: readonly MarkerId[]): string {
  const next = PHYSICAL_ORDER.find((o) => !scanned.includes(o));
  return `${MARKER_LABEL[id]} SCANNED ✓ — ${next ? `FIND THE ${MARKER_LABEL[next]}` : VERIFYING_TEXT}`;
}

export const alreadyScannedText = (id: MarkerId) => `${MARKER_LABEL[id]} ALREADY SCANNED`;

export const crowdedText = (ids: readonly MarkerId[]) =>
  `${ids.map((id) => MARKER_LABEL[id]).join(" + ")} IN VIEW — SCAN ONE OBJECT AT A TIME`;

/** Objects newly added between two progress lists (another phone's scans included). */
export function addedScans(
  before: readonly MarkerId[],
  after: readonly MarkerId[],
): MarkerId[] {
  return after.filter((id) => !before.includes(id));
}

export type LocalScanResult = "accepted" | "duplicate" | "wrong" | "solved";

/**
 * Standalone (no server) judge for the demo page: the same sequence rule the game server
 * applies. A wrong object clears the progress.
 */
export class LocalScanJudge {
  private ids: MarkerId[] = [];

  record(id: MarkerId): LocalScanResult {
    if (this.ids.includes(id)) return "duplicate";
    if (PHYSICAL_ORDER[this.ids.length] !== id) {
      this.ids = [];
      return "wrong";
    }
    this.ids.push(id);
    return this.ids.length === MARKER_IDS.length ? "solved" : "accepted";
  }

  reset() {
    this.ids = [];
  }

  current(): MarkerId[] {
    return [...this.ids];
  }
}
