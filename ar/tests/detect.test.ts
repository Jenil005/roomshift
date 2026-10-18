import { describe, expect, it } from "vitest";
import { bboxToMarker, coverTransform, iou } from "../detect/geometry";
import {
  adaptiveFrameGap,
  AI_MAX_FRAME_GAP_MS,
  AI_MIN_FRAME_GAP_MS,
  evidenceById,
  FrameIntervalMeter,
  hybridEvidenceAccepted,
  mergeHybrid,
  SightingTracker,
} from "../detect/hybrid";
import {
  aiDetectableIds,
  AI_CONFIDENCE,
  COCO_CLASS_MAP,
  mapDetections,
  minScoreFor,
  qrOnlyIds,
  type RawDetection,
} from "../detect/objectClasses";
import { PhysicalOrderTracker, toCameraResult } from "../physicalOrder";
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

/** A correct hybrid frame: AI book and cup, QR keyboard. */
const hybridFrame = (dx = 0): ObjectSighting[] =>
  mergeHybrid(
    [aiSighting("book", 0.2 + dx), aiSighting("cup", 0.5 + dx)],
    [qr("keyboard", 0.8 + dx)],
    ["keyboard"],
  );

describe("class mapping", () => {
  it("maps COCO book and cup; keyboard is QR-only", () => {
    expect(aiDetectableIds(COCO_CLASS_MAP)).toEqual(["book", "cup", "keyboard"]);
    expect(qrOnlyIds(COCO_CLASS_MAP)).toEqual([]);
  });

  it("a custom model that knows keyboard needs no QR tag", () => {
    const custom = { ...COCO_CLASS_MAP, keyboard: "keyboard" as const };
    expect(qrOnlyIds(custom)).toEqual([]);
  });

  it("never invents keyboard from COCO output and keeps other classes separate", () => {
    const { sightings, others } = mapDetections(
      [det("cup", 0.9, 300), det("person", 0.8, 10), det("keyboard", 0.99, 500)],
      W,
      H,
    );
    expect(sightings.map((s) => s.id)).toEqual(["cup", "keyboard"]);
    expect(sightings[0]).toMatchObject({ evidence: "ai", label: "cup", score: 0.9 });
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

  it("keeps two separate cups so the order check reports a duplicate", () => {
    const { sightings } = mapDetections(
      [det("book", 0.8, 10), det("cup", 0.9, 250), det("cup", 0.8, 500)],
      W,
      H,
    );
    expect(sightings.filter((s) => s.id === "cup")).toHaveLength(2);
    const tracker = new PhysicalOrderTracker();
    const frame = mergeHybrid(sightings, [qr("keyboard", 0.95)], ["keyboard"]);
    expect(tracker.update(frame, 0).status).toBe("duplicate");
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

  it("never accepts AI alone, nor a missing object", () => {
    const aiOnly = [aiSighting("book", 0.2), aiSighting("cup", 0.5), aiSighting("keyboard", 0.8)];
    expect(hybridEvidenceAccepted(aiOnly)).toBe(true);
    expect(hybridEvidenceAccepted(hybridFrame().slice(0, 2))).toBe(false);
    expect(hybridEvidenceAccepted(hybridFrame())).toBe(true);
  });

  it("records the evidence source per object in the result", () => {
    const tracker = new PhysicalOrderTracker();
    const frame = hybridFrame();
    const result = toCameraResult(frame, tracker.update(frame, 0));
    expect(result.evidence).toEqual({ book: "ai", cup: "ai", keyboard: "qr" });
    expect(result.source).toBe("camera");
    expect(evidenceById(frame)).toEqual(result.evidence);
  });

  it("plain QR markers are recorded as QR evidence", () => {
    const tracker = new PhysicalOrderTracker();
    const markers = [qr("book", 0.2), qr("cup", 0.5), qr("keyboard", 0.8)];
    expect(toCameraResult(markers, tracker.update(markers, 0)).evidence).toEqual({
      book: "qr",
      cup: "qr",
      keyboard: "qr",
    });
  });
});

describe("left-to-right arrangement with AI boxes", () => {
  const ai = { maxFrameGapMs: 1000, maxCenterDrift: 0.06, maxRowSpread: 0.3, minHoldFrames: 3 };

  it("orders by horizontal center regardless of detection order", () => {
    const tracker = new PhysicalOrderTracker(ai);
    const frame = hybridFrame().reverse();
    expect(tracker.update(frame, 0)).toMatchObject({
      status: "holding",
      order: ["book", "cup", "keyboard"],
    });
  });

  it("reports wrong order and missing objects, never verified", () => {
    const tracker = new PhysicalOrderTracker(ai);
    const wrong = mergeHybrid(
      [aiSighting("cup", 0.2), aiSighting("book", 0.5)],
      [qr("keyboard", 0.8)],
      ["keyboard"],
    );
    expect(tracker.update(wrong, 0).status).toBe("wrong-order");
    const noKeyboard = mergeHybrid([aiSighting("book", 0.2), aiSighting("cup", 0.5)], [], ["keyboard"]);
    for (let t = 0; t <= 3000; t += 250)
      expect(tracker.update(noKeyboard, t).status).toBe("incomplete");
  });

  it("tolerates the taller row spread of AI boxes", () => {
    const frame = mergeHybrid(
      [aiSighting("book", 0.2, 0.62), aiSighting("cup", 0.5, 0.45)],
      [qr("keyboard", 0.8, 0.4)],
      ["keyboard"],
    );
    expect(new PhysicalOrderTracker(ai).update(frame, 0).status).toBe("holding");
    expect(new PhysicalOrderTracker().update(frame, 0).status).toBe("unaligned");
  });
});

describe("stable-hold timing", () => {
  const ai = { maxFrameGapMs: 1000, maxCenterDrift: 0.06, maxRowSpread: 0.3, minHoldFrames: 3 };

  it("verifies after 1.2 s of fresh frames", () => {
    const tracker = new PhysicalOrderTracker(ai);
    const frame = hybridFrame();
    for (const t of [0, 300, 600, 900]) expect(tracker.update(frame, t).status).toBe("holding");
    expect(tracker.update(frame, 1200)).toMatchObject({ status: "verified", heldForMs: 1200 });
  });

  it("needs the minimum number of fresh frames even after 1.2 s", () => {
    const tracker = new PhysicalOrderTracker({ ...ai, maxFrameGapMs: 2500 });
    const frame = hybridFrame();
    expect(tracker.update(frame, 0).status).toBe("holding");
    expect(tracker.update(frame, 1300).status).toBe("holding"); // 2 frames only
    expect(tracker.update(frame, 2600).status).toBe("verified");
  });

  it("a gap longer than allowed restarts the hold (stale evidence is not continuous)", () => {
    const tracker = new PhysicalOrderTracker(ai);
    const frame = hybridFrame();
    tracker.update(frame, 0);
    tracker.update(frame, 500);
    expect(tracker.update(frame, 1600)).toMatchObject({ status: "holding", heldForMs: 0 });
  });

  it("box jitter within the AI drift limit is tolerated; larger motion restarts", () => {
    const tracker = new PhysicalOrderTracker(ai);
    tracker.update(hybridFrame(), 0);
    expect(tracker.update(hybridFrame(0.04), 300).status).toBe("holding");
    expect(tracker.update(hybridFrame(0.12), 600).status).toBe("unstable");
  });

  it("QR defaults are unchanged: 500 ms gap, one frame suffices", () => {
    const tracker = new PhysicalOrderTracker();
    const markers = [qr("book", 0.2), qr("cup", 0.5), qr("keyboard", 0.8)];
    tracker.update(markers, 0);
    expect(tracker.update(markers, 600).heldForMs).toBe(0); // 600 ms gap resets
    tracker.update(markers, 1000);
    expect(tracker.update(markers, 1400).status).toBe("holding");
    expect(tracker.update(markers, 1800).status).toBe("verified");
  });

  it("configure() changes the gap between frames", () => {
    const tracker = new PhysicalOrderTracker(ai);
    const frame = hybridFrame();
    tracker.update(frame, 0);
    tracker.configure({ maxFrameGapMs: 2500 });
    expect(tracker.update(frame, 1400).heldForMs).toBe(1400);
  });
});

describe("adaptive AI frame gap", () => {
  it("allows ~3 frame intervals within 1 s to 2.5 s", () => {
    expect(adaptiveFrameGap(0)).toBe(AI_MIN_FRAME_GAP_MS);
    expect(adaptiveFrameGap(Number.NaN)).toBe(AI_MIN_FRAME_GAP_MS);
    expect(adaptiveFrameGap(250)).toBe(AI_MIN_FRAME_GAP_MS);
    expect(adaptiveFrameGap(500)).toBe(1500);
    expect(adaptiveFrameGap(1400)).toBe(AI_MAX_FRAME_GAP_MS);
  });

  it("smooths frame intervals and ignores time going backwards", () => {
    const meter = new FrameIntervalMeter();
    meter.sample(0);
    expect(meter.interval).toBe(0);
    meter.sample(300);
    expect(meter.interval).toBe(300);
    meter.sample(1300);
    expect(meter.interval).toBeCloseTo(300 * 0.7 + 1000 * 0.3);
    const before = meter.interval;
    meter.sample(100);
    expect(meter.interval).toBe(before);
    meter.reset();
    expect(meter.interval).toBe(0);
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
