// The seam between the UI and the AR/vision teammate's code (ar/**).
// They implement an OrderScanner; the UI only ever sees PhysicalPuzzleResult.
import type { PhysicalPuzzleResult } from "../shared/types";

/** Called on a camera frame. Return null while nothing useful is detected yet. */
export type OrderScanner = (video: HTMLVideoElement) => PhysicalPuzzleResult | null;

/**
 * Replace this with the AR teammate's scanner once it exists, e.g.
 *   import { scanMarkerOrder } from "../../../ar/scanMarkerOrder";
 *   export const orderScanner: OrderScanner | null = scanMarkerOrder;
 * While it's null, the camera still shows and players use manual mode.
 */
export const orderScanner: OrderScanner | null = null;
