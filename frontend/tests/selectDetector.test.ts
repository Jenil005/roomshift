import { describe, expect, it, vi } from "vitest";
import { DetectorError, type ObjectDetector } from "../../ar/detect/ObjectDetector";
import { DEFAULT_DETECTOR, detectorPreference, loadPreferredDetector } from "../../ar/detect/selectDetector";
import { MEDIAPIPE_CONFIDENCE, MEDIAPIPE_SCAN_CONFIDENCE } from "../../ar/detect/mediapipeDetector";
import { AI_CONFIDENCE, COCO_CLASS_MAP, mapDetections, qrOnlyIds, scanCandidates } from "../../ar/detect/objectClasses";

const fake = (name: string): ObjectDetector => ({ name, classMap: COCO_CLASS_MAP, detect: async () => [] });

describe("detector selection", () => {
  it("defaults to COCO-SSD; ?detector= overrides", () => {
    expect(DEFAULT_DETECTOR).toBe("coco");
    expect(detectorPreference("")).toBe("coco");
    expect(detectorPreference("?detector=mediapipe")).toBe("mediapipe");
    expect(detectorPreference("?detector=auto")).toBe("auto");
    expect(detectorPreference("?detector=bogus")).toBe("coco");
  });

  it("coco never touches MediaPipe", async () => {
    const mediapipe = vi.fn(async () => fake("mp"));
    const coco = vi.fn(async () => fake("coco"));
    expect((await loadPreferredDetector("coco", { mediapipe, coco })).name).toBe("coco");
    expect(mediapipe).not.toHaveBeenCalled();
  });

  it("auto uses MediaPipe when it loads, without loading COCO-SSD", async () => {
    const coco = vi.fn(async () => fake("coco"));
    expect((await loadPreferredDetector("auto", { mediapipe: async () => fake("mp"), coco })).name).toBe("mp");
    expect(coco).not.toHaveBeenCalled();
  });

  it("auto falls back to COCO-SSD only after MediaPipe failed (one model at a time)", async () => {
    const order: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const detector = await loadPreferredDetector("auto", {
      mediapipe: async () => {
        order.push("mp:start");
        throw new DetectorError("unsupported", "no WebAssembly");
      },
      coco: async () => {
        order.push("coco:start");
        return fake("coco");
      },
    });
    warn.mockRestore();
    expect(detector.name).toBe("coco");
    expect(order).toEqual(["mp:start", "coco:start"]);
  });

  it("an explicit mediapipe request surfaces the failure instead of hiding it", async () => {
    await expect(
      loadPreferredDetector("mediapipe", { mediapipe: async () => Promise.reject(new DetectorError("model-failed")), coco: async () => fake("coco") }),
    ).rejects.toMatchObject({ code: "model-failed" });
  });
});

describe("MediaPipe class mapping and thresholds", () => {
  it("maps COCO labels including keyboard, and applies MediaPipe's own thresholds", () => {
    expect(qrOnlyIds(COCO_CLASS_MAP)).toEqual([]);
    const raw = [
      { label: "book", score: 0.42, bbox: [247, 117, 155, 256] as [number, number, number, number] },
      { label: "book", score: 0.25, bbox: [2, 162, 167, 244] as [number, number, number, number] },
      { label: "cup", score: 0.79, bbox: [352, 123, 190, 130] as [number, number, number, number] },
      { label: "keyboard", score: 0.9, bbox: [0, 0, 50, 20] as [number, number, number, number] },
    ];
    const mp = mapDetections(raw, 640, 427, COCO_CLASS_MAP, MEDIAPIPE_CONFIDENCE);
    expect(mp.sightings.map((s) => [s.id, s.score])).toEqual([["keyboard", 0.9], ["cup", 0.79], ["book", 0.42]]);
    expect(mp.others).toEqual([]);
    // MediaPipe's real book score (0.42) is enough to scan with its own scan bars, not COCO-SSD's.
    expect(scanCandidates(mp.sightings, MEDIAPIPE_SCAN_CONFIDENCE).map((c) => c.id)).toEqual(["book", "cup", "keyboard"]);
    expect(scanCandidates(mp.sightings).map((c) => c.id)).toEqual(["cup", "keyboard"]);
    // The same weak book box would be dropped by COCO-SSD's thresholds: scores are per model.
    expect(mapDetections(raw, 640, 427, COCO_CLASS_MAP, AI_CONFIDENCE).sightings.map((s) => s.id)).toEqual(["keyboard", "cup"]);
  });
});
