import { describe, expect, it } from "vitest";
import { bboxToMarker, coverTransform, iou } from "../detect/geometry";
import { mergeHybrid, SightingTracker } from "../detect/hybrid";
import {
  aiDetectableIds,
  AI_CONFIDENCE,
  COCO_CLASS_MAP,
  mapDetections,
  minScoreFor,
  qrOnlyIds,
  scanCandidates,
  AI_SCAN_CONFIDENCE,
  scanScoreFor,
  SCAN_MIN_CONFIDENCE,
  type RawDetection,
} from "../detect/objectClasses";
import type { DetectedMarker, MarkerId, ObjectSighting } from "../types";

const W = 640;
const H = 360;
const det = (
  label: string,
  score: number,
  x: number,
  y = 100,
  w = 100,
  h = 120,
): RawDetection => ({ label, score, bbox: [x, y, w, h] });

function qr(id: MarkerId, x: number, y = 0.5): DetectedMarker {
  return {
    id,
    center: { x, y },
    corners: [
      { x: x - 0.06, y: y - 0.06 },
      { x: x + 0.06, y: y - 0.06 },
      { x: x + 0.06, y: y + 0.06 },
      { x: x - 0.06, y: y + 0.06 },
    ],
  };
}

const aiSighting = (id: MarkerId, x: number, y = 0.5): ObjectSighting => ({
  ...qr(id, x, y),
  evidence: "ai",
  score: 0.8,
  label: id,
});

describe("class mapping", () => {
  it("maps COCO book, cup and keyboard; nothing is QR-only", () => {
    expect(aiDetectableIds(COCO_CLASS_MAP)).toEqual(["book", "cup", "keyboard"]);
    expect(qrOnlyIds(COCO_CLASS_MAP)).toEqual([]);
  });

  it("a custom model that knows keyboard needs no QR tag", () => {
    const custom = { ...COCO_CLASS_MAP, keyboard: "keyboard" as const };
    expect(qrOnlyIds(custom)).toEqual([]);
  });

  it("maps the COCO keyboard class and keeps other classes separate", () => {
    const { sightings, others } = mapDetections(
      [det("cup", 0.9, 300), det("person", 0.8, 10), det("keyboard", 0.99, 500)],
      W,
      H,
    );
    expect(sightings.map((s) => s.id)).toEqual(["keyboard", "cup"]); // strongest first
    expect(sightings[1]).toMatchObject({ evidence: "ai", label: "cup", score: 0.9 });
    expect(others.map((o) => o.label).sort()).toEqual(["person"]);
  });

  it("ignores inherited object keyboard such as toString", () => {
    const { sightings } = mapDetections([det("toString", 0.9, 10)], W, H);
    expect(sightings).toEqual([]);
  });
});

describe("bounding-box conversion", () => {
  it("normalizes pixel boxes to center and clockwise corners", () => {
    const shape = bboxToMarker([64, 36, 128, 72], W, H)!;
    expect(shape.center.x).toBeCloseTo(0.2);
    expect(shape.center.y).toBeCloseTo(0.2);
    expect(shape.corners[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(shape.corners[2].x).toBeCloseTo(0.3);
    expect(shape.corners[2].y).toBeCloseTo(0.3);
  });

  it("clamps boxes that extend past the frame edge", () => {
    const shape = bboxToMarker([-20, -10, 100, 50], W, H)!;
    expect(shape.corners[0]).toEqual({ x: 0, y: 0 });
  });

  it("rejects empty, invalid or off-frame boxes", () => {
    expect(bboxToMarker([10, 10, 0, 10], W, H)).toBeNull();
    expect(bboxToMarker([NaN, 10, 10, 10], W, H)).toBeNull();
    expect(bboxToMarker([700, 10, 50, 50], W, H)).toBeNull();
    expect(bboxToMarker([10, 10, 10, 10], 0, H)).toBeNull();
  });

  it("computes intersection over union", () => {
    const a = bboxToMarker([0, 0, 100, 100], W, H)!.corners;
    const b = bboxToMarker([50, 0, 100, 100], W, H)!.corners;
    const far = bboxToMarker([400, 0, 100, 100], W, H)!.corners;
    expect(iou(a, a)).toBeCloseTo(1);
    expect(iou(a, b)).toBeCloseTo(1 / 3);
    expect(iou(a, far)).toBe(0);
  });

  it("maps video coordinates through object-fit: cover cropping", () => {
    // 16:9 video shown in a square element: the sides are cropped.
    const toView = coverTransform(1600, 900, 900, 900);
    expect(toView({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    const left = toView({ x: 0.25, y: 0 });
    expect(left.x).toBeCloseTo((0.25 * 1600 - 350) / 900);
    expect(left.y).toBeCloseTo(0);
    // Same aspect ratio: identity.
    expect(coverTransform(1280, 720, 640, 360)({ x: 0.3, y: 0.7 })).toEqual({
      x: 0.3,
      y: 0.7,
    });
  });
});

describe("confidence filtering", () => {
  it("uses per-class thresholds with a default", () => {
    expect(minScoreFor("book")).toBe(AI_CONFIDENCE.book);
    expect(minScoreFor("cup")).toBe(AI_CONFIDENCE.cup);
    expect(minScoreFor("person")).toBe(AI_CONFIDENCE.default);
  });

  it("drops detections below their class threshold", () => {
    const { sightings, others } = mapDetections(
      [
        det("book", 0.46, 10),
        det("cup", 0.5, 300), // below cup's 0.55
        det("person", 0.49, 500), // below default 0.5
        det("cup", Number.NaN, 400),
      ],
      W,
      H,
    );
    expect(sightings.map((s) => s.id)).toEqual(["book"]);
    expect(others).toEqual([]);
  });
});

describe("duplicate detections", () => {
  it("merges overlapping boxes of one object and keeps the higher score", () => {
    const { sightings } = mapDetections(
      [det("cup", 0.7, 300), det("cup", 0.9, 305, 102)],
      W,
      H,
    );
    expect(sightings).toHaveLength(1);
    expect(sightings[0].score).toBe(0.9);
  });

  it("keeps two separate cups, which the scanner sees as one candidate object", () => {
    const { sightings } = mapDetections(
      [det("book", 0.8, 10), det("cup", 0.9, 250), det("cup", 0.8, 500)],
      W,
      H,
    );
    expect(sightings.filter((s) => s.id === "cup")).toHaveLength(2);
    expect(scanCandidates(sightings).map((c) => c.id)).toEqual(["book", "cup"]);
  });
});

describe("hybrid AI + QR evidence", () => {
  it("takes KEYBOARD from QR and ignores QR tags for AI-detectable objects", () => {
    const merged = mergeHybrid(
      [aiSighting("book", 0.2)],
      [qr("book", 0.25), qr("keyboard", 0.8)],
      ["keyboard"],
    );
    expect(merged.map((s) => `${s.id}:${s.evidence}`)).toEqual([
      "book:ai",
      "keyboard:qr",
    ]);
  });

});

describe("single-object scan candidates", () => {
  it("counts an AI sighting only at or above its single-frame scan bar", () => {
    expect(scanScoreFor("book")).toBe(AI_SCAN_CONFIDENCE.book);
    expect(scanScoreFor("book")).toBeGreaterThan(AI_CONFIDENCE.book); // stricter than display
    expect(scanScoreFor("keyboard")).toBe(AI_SCAN_CONFIDENCE.default);
    const at = (id: MarkerId, score: number): ObjectSighting => ({ ...aiSighting(id, 0.5), score });
    expect(scanCandidates([at("book", 0.49)])).toEqual([]);
    expect(scanCandidates([at("book", 0.5)])).toEqual([{ id: "book", evidence: "ai", score: 0.5 }]);
    expect(scanCandidates([at("cup", 0.58)])).toEqual([]);
  });

  it("never goes below the server's floor, whatever a detector declares", () => {
    const lax = { default: 0.1 };
    expect(scanScoreFor("book", lax)).toBe(SCAN_MIN_CONFIDENCE);
  });

  it("rejects missing or non-finite scores", () => {
    const s = aiSighting("keyboard", 0.5);
    expect(scanCandidates([{ ...s, score: undefined }])).toEqual([]);
    expect(scanCandidates([{ ...s, score: Number.NaN }])).toEqual([]);
  });

  it("keeps the best sighting per object and accepts decoded QR tags", () => {
    const frame: ObjectSighting[] = [
      { ...aiSighting("cup", 0.2), score: 0.7 },
      { ...aiSighting("cup", 0.6), score: 0.9 },
      { ...qr("keyboard", 0.8), evidence: "qr" },
    ];
    expect(scanCandidates(frame)).toEqual([
      { id: "cup", evidence: "ai", score: 0.9 },
      { id: "keyboard", evidence: "qr" },
    ]);
  });

  it("a lone keyboard is a complete candidate: no other object and no QR tag needed", () => {
    expect(scanCandidates([aiSighting("keyboard", 0.5)])).toEqual([
      { id: "keyboard", evidence: "ai", score: 0.8 },
    ]);
  });
});

describe("tracking across inference results", () => {
  it("keeps identity across frames and counts hits", () => {
    const tracker = new SightingTracker(800);
    tracker.update([aiSighting("cup", 0.5)], 0);
    const [cup] = tracker.update([aiSighting("cup", 0.52)], 250);
    expect(cup).toMatchObject({ id: "cup", hits: 2, firstSeen: 0, lastSeen: 250, stale: false });
  });

  it("remembers a missed object briefly as stale, then drops it", () => {
    const tracker = new SightingTracker(800);
    tracker.update([aiSighting("book", 0.2)], 0);
    expect(tracker.update([], 500)).toMatchObject([{ id: "book", stale: true }]);
    expect(tracker.update([], 900)).toEqual([]);
  });

  it("treats a far jump as a new object", () => {
    const tracker = new SightingTracker();
    tracker.update([aiSighting("cup", 0.1)], 0);
    const next = tracker.update([aiSighting("cup", 0.9)], 250);
    const fresh = next.find((t) => !t.stale)!;
    expect(fresh).toMatchObject({ hits: 1, firstSeen: 250 });
  });
});
