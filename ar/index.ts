// Physical puzzle and QR scanning entry point (React, no three.js). The shared 3D room is
// a separate entry: "ar/room". See ar/README.md "Frontend integration".
export { PhysicalPuzzle } from "./PhysicalPuzzle"; // also loads its scoped PhysicalPuzzle.css
export { useCameraScanner, SCAN_ERROR_MESSAGE } from "./useCameraScanner";
export { detectMarkers } from "./detectMarkers";
export { PhysicalOrderTracker, toCameraResult } from "./physicalOrder";
export type { OrderReading, OrderStatus } from "./physicalOrder";
export { CameraScanSession, scanErrorCode } from "./scan/CameraScanSession";
export type { ScanEndReason } from "./scan/CameraScanSession";
export { ScanDebouncer, ScanSequence, SCAN_DEBOUNCE_MS } from "./scan/ScanSequence";
export { encodeTagPayload, parseTagPayload } from "./scan/tagPayload";
export {
  MARKER_IDS,
  MARKER_LABEL,
  PHYSICAL_ORDER,
  TAG_PREFIX,
  type DetectedMarker,
  type MarkerId,
  type PhysicalPuzzleResult,
  type Point,
  type ScanErrorCode,
  type ScanSession,
} from "./types";
