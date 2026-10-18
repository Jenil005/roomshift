import { COCO_CLASS_MAP, type ConfidenceThresholds, type RawDetection } from "./objectClasses";
import { DetectorError, type ObjectDetector } from "./ObjectDetector";

// Self-hosted (no runtime CDN): WASM from @mediapipe/tasks-vision 1.0.1 and Google's
// EfficientDet-Lite0 float16 (COCO labels, Apache-2.0), see public/models/mediapipe/NOTICE.md.
export const MEDIAPIPE_WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`;
export const MEDIAPIPE_MODEL_URL = `${import.meta.env.BASE_URL}models/mediapipe/efficientdet_lite0_fp16.tflite`;
const MAX_RESULTS = 20;
// Loose threshold inside the model; mapDetections applies MEDIAPIPE_CONFIDENCE per class.
const MODEL_MIN_SCORE = 0.25;

/**
 * EfficientDet-Lite0 scores run lower than COCO-SSD's. Measured on the same CC0 test photos the
 * COCO-SSD thresholds were tuned on (frontend/e2e/detectors.spec.ts, 2026-10-17, desktop
 * Chromium): book 0.42 (COCO-SSD 0.67), cup 0.79 (COCO-SSD 0.96); a weaker second "book" box
 * at 0.25 is rejected. Not yet measured on an iPhone. Marking an object scanned needs the
 * stricter MEDIAPIPE_SCAN_CONFIDENCE in a single frame.
 */
export const MEDIAPIPE_CONFIDENCE: ConfidenceThresholds = {
  default: 0.5,
  book: 0.35,
  cup: 0.4,
  keyboard: 0.45,
};

// Single-frame scan bars for this model (EfficientDet scores run lower than COCO-SSD's).
export const MEDIAPIPE_SCAN_CONFIDENCE: ConfidenceThresholds = {
  default: 0.5,
  book: 0.4,
  cup: 0.5,
  keyboard: 0.5,
};

type Loaded = { detector: ObjectDetector; release: () => void };
let shared: Promise<Loaded> | null = null;

/**
 * Loads MediaPipe Tasks Vision and the model once per page and reuses it (call
 * releaseMediaPipeDetector to free it). GPU delegate first, CPU if the GPU path fails.
 * Rejects with DetectorError when WebAssembly is missing or loading fails, so the caller can
 * fall back to COCO-SSD. A failed load is forgotten so a later call can retry.
 */
export function loadMediaPipeDetector(
  options: { wasmUrl?: string; modelUrl?: string } = {},
): Promise<ObjectDetector> {
  shared ??= load(options.wasmUrl ?? MEDIAPIPE_WASM_URL, options.modelUrl ?? MEDIAPIPE_MODEL_URL).catch((error: unknown) => {
    shared = null;
    throw error instanceof DetectorError ? error : new DetectorError("model-failed", String(error));
  });
  return shared.then((loaded) => loaded.detector);
}

export function releaseMediaPipeDetector() {
  const current = shared;
  shared = null;
  void current?.then((loaded) => loaded.release()).catch(() => undefined);
}

async function load(wasmUrl: string, modelUrl: string): Promise<Loaded> {
  if (typeof WebAssembly !== "object") throw new DetectorError("unsupported", "WebAssembly is not available");
  const { FilesetResolver, ObjectDetector: MPObjectDetector } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
  const create = (delegate: "GPU" | "CPU") =>
    MPObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: "IMAGE",
      maxResults: MAX_RESULTS,
      scoreThreshold: MODEL_MIN_SCORE,
    });
  let model: Awaited<ReturnType<typeof create>>;
  let delegate: "GPU" | "CPU" = "GPU";
  try {
    model = await create("GPU");
    warmUp(model);
  } catch {
    delegate = "CPU"; // no WebGL2 / GPU delegate failure: the CPU (WASM SIMD) path still works
    model = await create("CPU");
    warmUp(model);
  }

  let released = false;
  const detector: ObjectDetector = {
    name: `MediaPipe EfficientDet-Lite0 (${delegate})`,
    classMap: COCO_CLASS_MAP, // COCO labels: book, cup and keyboard.
    thresholds: MEDIAPIPE_CONFIDENCE,
    scanThresholds: MEDIAPIPE_SCAN_CONFIDENCE,
    async detect(frame) {
      if (released || frame.width === 0 || frame.height === 0) return [];
      const result = model.detect(frame);
      const out: RawDetection[] = [];
      for (const d of result.detections) {
        const box = d.boundingBox;
        const top = d.categories[0];
        if (!box || !top) continue;
        // MediaPipe boxes are in pixels of the input image (the canvas we pass), top-left origin:
        // the same contract as COCO-SSD's bbox, so geometry/mapping is shared.
        out.push({ label: top.categoryName, score: top.score, bbox: [box.originX, box.originY, box.width, box.height] });
      }
      return out;
    },
  };
  return {
    detector,
    release: () => {
      released = true;
      model.close();
    },
  };
}

/** A real inference on a blank frame: proves the delegate works before the player relies on it. */
function warmUp(model: { detect(image: HTMLCanvasElement): unknown }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  model.detect(canvas);
}
