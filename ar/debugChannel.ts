/**
 * Tester diagnostics. Camera, detector and tracking code report small status values here;
 * the game's ?debug overlay listens. Never carries tokens, clues or camera pixels.
 */
export type DebugReport = Partial<{
  camera: string;
  detector: string;
  inferenceMs: number;
  tracking: string;
  frameMs: number;
  error: string;
}>;

export const DEBUG_EVENT = "roomshift:debug";

export function reportDebug(report: DebugReport) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<DebugReport>(DEBUG_EVENT, { detail: report }));
}
