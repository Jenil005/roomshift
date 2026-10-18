import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The loader's heavy modules are mocked: these tests check caching, the self-hosted URL and
// failure handling, not TensorFlow itself (the browser tests run the real model).
const tf = { setBackend: vi.fn(), ready: vi.fn() };
const model = { detect: vi.fn(), dispose: vi.fn() };
const cocoSsd = { load: vi.fn() };
vi.mock("@tensorflow/tfjs-core", () => tf);
vi.mock("@tensorflow/tfjs-backend-webgl", () => ({}));
vi.mock("@tensorflow-models/coco-ssd", () => cocoSsd);

const loader = () => import("../detect/cocoSsdDetector");

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0 }) });
  tf.setBackend.mockResolvedValue(true);
  tf.ready.mockResolvedValue(undefined);
  model.detect.mockResolvedValue([]);
  cocoSsd.load.mockResolvedValue(model);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("COCO-SSD loader", () => {
  it("loads once from the self-hosted URL and reuses the model", async () => {
    const { loadCocoSsdDetector, COCO_SSD_MODEL_URL } = await loader();
    const [a, b] = await Promise.all([loadCocoSsdDetector(), loadCocoSsdDetector()]);
    expect(a).toBe(b);
    expect(await loadCocoSsdDetector()).toBe(a);
    expect(cocoSsd.load).toHaveBeenCalledTimes(1);
    expect(cocoSsd.load).toHaveBeenCalledWith({
      base: "lite_mobilenet_v2",
      modelUrl: COCO_SSD_MODEL_URL,
    });
    expect(COCO_SSD_MODEL_URL).toMatch(/^\/models\/coco-ssd\/.+\/model\.json$/);
    expect(COCO_SSD_MODEL_URL).not.toMatch(/https?:/);
    expect(tf.setBackend).toHaveBeenCalledWith("webgl");
  });

  it("maps model output to raw detections", async () => {
    model.detect.mockResolvedValue([]);
    const { loadCocoSsdDetector } = await loader();
    const detector = await loadCocoSsdDetector();
    model.detect.mockResolvedValue([{ class: "cup", score: 0.9, bbox: [1, 2, 3, 4] }]);
    expect(await detector.detect({} as HTMLCanvasElement)).toEqual([
      { label: "cup", score: 0.9, bbox: [1, 2, 3, 4] },
    ]);
    expect(detector.classMap).toEqual({ book: "book", cup: "cup", keyboard: "keyboard" });
  });

  it("reports a model download failure and retries on the next call", async () => {
    cocoSsd.load.mockRejectedValueOnce(new Error("404"));
    const { loadCocoSsdDetector } = await loader();
    await expect(loadCocoSsdDetector()).rejects.toMatchObject({
      name: "DetectorError",
      code: "model-failed",
    });
    await expect(loadCocoSsdDetector()).resolves.toBeDefined();
    expect(cocoSsd.load).toHaveBeenCalledTimes(2);
  });

  it("reports unsupported when WebGL is unavailable", async () => {
    tf.setBackend.mockResolvedValue(false);
    const { loadCocoSsdDetector } = await loader();
    await expect(loadCocoSsdDetector()).rejects.toMatchObject({ code: "unsupported" });
    expect(cocoSsd.load).not.toHaveBeenCalled();
  });

  it("release frees the model; the next load starts fresh", async () => {
    const { loadCocoSsdDetector, releaseCocoSsdDetector } = await loader();
    const first = await loadCocoSsdDetector();
    releaseCocoSsdDetector();
    await vi.waitFor(() => expect(model.dispose).toHaveBeenCalledTimes(1));
    expect(await first.detect({} as HTMLCanvasElement)).toEqual([]);
    await loadCocoSsdDetector();
    expect(cocoSsd.load).toHaveBeenCalledTimes(2);
  });
});
