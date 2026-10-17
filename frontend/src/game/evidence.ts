import type { PuzzleSubmission } from "@shared/types";
import type { PhysicalPuzzleResult } from "../../../ar/types";

/**
 * AR scanner result -> the backend's puzzle 1 submission. Only what the server uses is sent:
 * marker ids + normalized centers + hold time for camera evidence (the server derives the
 * order and ignores `solved`), or the reported order for a manual report.
 * Keeps the body far below the API's 4 KB limit (corners, scores and labels stay local).
 */
export function toPuzzle1Submission(result: PhysicalPuzzleResult): PuzzleSubmission {
  const physical =
    result.source === "camera"
      ? {
          source: "camera" as const,
          markers: result.markers.map((m) => ({ id: m.id, center: { x: round(m.center.x), y: round(m.center.y) } })),
          heldForMs: Math.round(result.heldForMs),
        }
      : { source: "manual" as const, order: [...result.order] };
  // roomCode / playerId are ignored by the server: identity comes from the player token.
  return { roomCode: "", playerId: "", puzzle: 1, physical };
}

const round = (v: number) => Math.round(v * 10_000) / 10_000;
