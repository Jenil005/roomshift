import type { ObjectScanInput, PuzzleSubmission } from "@shared/types";
import type { ObjectScanReport, PhysicalPuzzleResult } from "../../../ar/types";

/**
 * AR manual report -> the backend's puzzle 1 submission (recorded as manual evidence).
 * Camera scans never come through here: each object goes to puzzle1:scan (toScanInput).
 */
export function toPuzzle1Submission(result: PhysicalPuzzleResult): PuzzleSubmission {
  // roomCode / playerId are ignored by the server: identity comes from the player token.
  return { roomCode: "", playerId: "", puzzle: 1, physical: { source: "manual", order: [...result.order] } };
}

/**
 * One scanner report -> the puzzle1:scan payload. Only what the server checks is sent; the
 * score is rounded down so it is never reported higher than the detector gave it.
 */
export function toScanInput(scan: ObjectScanReport): ObjectScanInput {
  return scan.evidence === "ai"
    ? { object: scan.id, source: "ai", confidence: Math.floor((scan.score ?? 0) * 1000) / 1000 }
    : { object: scan.id, source: "qr" };
}
