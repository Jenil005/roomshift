// Physical puzzle and QR scanning entry point (React, no three.js). The shared 3D room is
// a separate entry: "ar/room". See ar/README.md "Frontend integration".
export { PhysicalPuzzle, type HostScans, type ScanMode } from "./PhysicalPuzzle"; // also loads its scoped PhysicalPuzzle.css
// AI object detection. TensorFlow.js and the model load lazily on first use of AI Scanner.
export { AiScanner } from "./AiScanner";
export { AiScanSession, type AiFrame } from "./detect/AiScanSession";
export {
  COCO_SSD_MODEL_URL,
  loadCocoSsdDetector,
  releaseCocoSsdDetector,
} from "./detect/cocoSsdDetector";
export { DetectorError, type ObjectDetector } from "./detect/ObjectDetector";
export {
  COCO_CLASS_MAP,
  AI_CONFIDENCE,
  AI_SCAN_CONFIDENCE,
  SCAN_MIN_CONFIDENCE,
  scanCandidates,
  scanScoreFor,
} from "./detect/objectClasses";
export { useObjectDetector, MODEL_LOAD_TIMEOUT_MS } from "./useAiScanner";
export { useCameraScanner, SCAN_ERROR_MESSAGE } from "./useCameraScanner";
export { detectMarkers } from "./detectMarkers";
export { ScanProgress, useScanNotices } from "./ScanProgress";
export {
  addedScans,
  alreadyScannedText,
  decideFrame,
  LocalScanJudge,
  scannedText,
  SCAN_COMPLETE_TEXT,
  type FrameDecision,
} from "./scan/objectScan";
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
  type EvidenceSource,
  type MarkerId,
  type ObjectScanReport,
  type ObjectSighting,
  type PhysicalPuzzleResult,
  type Point,
  type ScanErrorCode,
  type ScanNotice,
  type ScanSession,
} from "./types";
