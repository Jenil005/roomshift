import { describe, expect, it } from "vitest";
import {
  evaluateOrder,
  PhysicalOrderTracker,
  toCameraResult,
} from "../physicalOrder";
import { cameraErrorMessage } from "../useCameraScanner";
import type { DetectedMarker, MarkerId } from "../types";

function marker(id: MarkerId, x: number, y = 0.5): DetectedMarker {
  return {
    id,
    center: { x, y },
    corners: [
      { x: x - 0.08, y: y - 0.08 },
      { x: x + 0.08, y: y - 0.08 },
      { x: x + 0.08, y: y + 0.08 },
      { x: x - 0.08, y: y + 0.08 },
    ],
  };
}
const correct = [marker("BOOK", 0.2), marker("CUP", 0.5), marker("KEYS", 0.8)];

describe("physical order verification", () => {
  it("uses spatial position rather than detector discovery order", () => {
    expect(evaluateOrder([correct[2], correct[0], correct[1]])).toEqual({
      status: "holding",
      order: ["BOOK", "CUP", "KEYS"],
    });
  });
  it("rejects missing cards, duplicates, wrong orders, and ambiguous layouts", () => {
    expect(evaluateOrder(correct.slice(0, 2)).status).toBe("incomplete");
    expect(evaluateOrder([...correct, marker("BOOK", 0.1)]).status).toBe(
      "duplicate",
    );
    expect(
      evaluateOrder([
        marker("CUP", 0.2),
        marker("BOOK", 0.5),
        marker("KEYS", 0.8),
      ]).status,
    ).toBe("wrong-order");
    expect(
      evaluateOrder([correct[0], marker("CUP", 0.5, 0.8), correct[2]]).status,
    ).toBe("unaligned");
    expect(
      evaluateOrder([correct[0], marker("CUP", 0.3), correct[2]]).status,
    ).toBe("unaligned");
  });
  it("requires 1.2 seconds of consecutive correct frames", () => {
    const tracker = new PhysicalOrderTracker();
    for (let t = 0; t < 1200; t += 200)
      expect(tracker.update(correct, t).status).toBe("holding");
    expect(tracker.update(correct, 1200)).toMatchObject({
      status: "verified",
      progress: 1,
      heldForMs: 1200,
    });
  });
  it("resets immediately when a card disappears or the order changes", () => {
    const tracker = new PhysicalOrderTracker();
    tracker.update(correct, 0);
    tracker.update(correct, 400);
    tracker.update(correct, 800);
    expect(tracker.update([], 900).progress).toBe(0);
    expect(tracker.update(correct, 1000).heldForMs).toBe(0);
    tracker.update([marker("CUP", 0.2), marker("BOOK", 0.5), correct[2]], 1100);
    expect(tracker.update(correct, 1200).heldForMs).toBe(0);
  });
  it("cannot verify across a suspended stream or after an explicit reset", () => {
    const tracker = new PhysicalOrderTracker();
    tracker.update(correct, 0);
    expect(tracker.update(correct, 5000).heldForMs).toBe(0);
    tracker.update(correct, 5300);
    tracker.reset();
    expect(tracker.update(correct, 5500).heldForMs).toBe(0);
  });

  it("resets the hold on physical movement even when the order remains correct", () => {
    const tracker = new PhysicalOrderTracker();
    tracker.update(correct, 0);
    tracker.update(correct, 400);
    tracker.update(correct, 800);
    const shifted = correct.map((m) => marker(m.id, m.center.x + 0.05));
    expect(tracker.update(shifted, 1000)).toMatchObject({
      status: "unstable",
      heldForMs: 0,
      progress: 0,
    });
    for (let t = 1200; t < 2200; t += 200)
      expect(tracker.update(shifted, t).status).toBe("holding");
    expect(tracker.update(shifted, 2200).status).toBe("verified");
  });

  it("allows small tracking jitter but detects accumulated drift from the hold's anchor", () => {
    const tracker = new PhysicalOrderTracker();
    tracker.update(correct, 0);
    for (let t = 200; t <= 600; t += 200) {
      const shifted = correct.map((m) => marker(m.id, m.center.x + t / 20000));
      expect(tracker.update(shifted, t).status).toBe("holding");
    }
    const drifted = correct.map((m) => marker(m.id, m.center.x + 0.04));
    expect(tracker.update(drifted, 800).status).toBe("unstable");
  });

  it("produces serializable typed evidence for both unsolved and solved observations", () => {
    const tracker = new PhysicalOrderTracker();
    expect(toCameraResult(correct, tracker.update(correct, 0))).toMatchObject({
      solved: false,
      source: "camera",
      heldForMs: 0,
    });
    for (let t = 200; t < 1200; t += 200) tracker.update(correct, t);
    const result = toCameraResult(correct, tracker.update(correct, 1200));
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      solved: true,
      markers: correct,
      detectedIds: ["BOOK", "CUP", "KEYS"],
      order: ["BOOK", "CUP", "KEYS"],
      heldForMs: 1200,
    });
  });
});

describe("camera error guidance", () => {
  it.each([
    ["NotAllowedError", "Allow camera access"],
    ["NotFoundError", "No camera was found"],
    ["NotReadableError", "Close other apps"],
  ])("explains %s", (name, message) => {
    const error = new Error();
    error.name = name;
    expect(cameraErrorMessage(error)).toContain(message);
  });
});
