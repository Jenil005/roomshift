import { COCO_CLASS_MAP, type RawDetection } from "./objectClasses";
import { DetectorError, type ObjectDetector } from "./ObjectDetector";

// Self-hosted model (ar/public/models/coco-ssd/, Apache-2.0). Never fetched from a CDN at runtime.
export const COCO_SSD_MODEL_URL = `${import.meta.env.BASE_URL}models/coco-ssd/ssdlite_mobilenet_v2/model.json`;
const MAX_BOXES = 20;
// Loose threshold inside the model; mapDetections applies the per-class AI_CONFIDENCE.
const MODEL_MIN_SCORE = 0.4;

type Loaded = { detector: ObjectDetector; release: () => void };

let shared: Promise<Loaded> | null = null;

/**
 * Loads TensorFlow.js (WebGL backend) and COCO-SSD once per page and reuses it. The heavy
 * modules are dynamically imported, so they are only downloaded when AI Scanner is used.
 * A failed load is forgotten, so the next call retries.
 */
export function loadCocoSsdDetector(
  modelUrl = COCO_SSD_MODEL_URL,
): Promise<ObjectDetector> {
  shared ??= load(modelUrl).catch((error: unknown) => {
    shared = null;
    throw error instanceof DetectorError
      ? error
      : new DetectorError("model-failed", String(error));
  });
  return shared.then((loaded) => loaded.detector);
}

/** True once the model is loaded (or loading) in this page. */
export function cocoSsdRequested(): boolean {
  return shared !== null;
}

/** Frees the model's GPU memory, e.g. when the game leaves puzzle 1. Safe to call any time. */
export function releaseCocoSsdDetector() {
  const current = shared;
  shared = null;
  void current?.then((loaded) => loaded.release()).catch(() => undefined);
}

async function load(modelUrl: string): Promise<Loaded> {
  const [tf, cocoSsd] = await Promise.all([
    import("@tensorflow/tfjs-core"),
    import("@tensorflow-models/coco-ssd"),
    import("@tensorflow/tfjs-backend-webgl"), // registers the "webgl" backend
    // coco-ssd switches to "cpu" for its box post-processing on every frame (without awaiting);
    // without this backend registered each inference raised an unhandled rejection.
    import("@tensorflow/tfjs-backend-cpu"),
  ]);
  let backendReady = false;
  try {
    backendReady = await tf.setBackend("webgl");
  } catch {
    backendReady = false;
  }
  if (!backendReady)
    throw new DetectorError("unsupported", "WebGL is not available");
  await tf.ready();
  const model = await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl });
  // Warm up once so the first real frame does not pay for shader compilation.
  const warm = document.createElement("canvas");
  warm.width = warm.height = 64;
  await model.detect(warm, 1, 0.99);

  let released = false;
  const detector: ObjectDetector = {
    name: "COCO-SSD lite_mobilenet_v2",
    classMap: COCO_CLASS_MAP,
    async detect(frame) {
      if (released) return [];
      // coco-ssd disposes its own intermediate tensors; the canvas is read once and discarded.
      const out = await model.detect(frame, MAX_BOXES, MODEL_MIN_SCORE);
      return out.map(
        (d): RawDetection => ({ label: d.class, score: d.score, bbox: d.bbox }),
      );
    },
  };
  return {
    detector,
    release: () => {
      released = true;
      model.dispose();
    },
  };
}
