import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawDetection } from "../detect/objectClasses";
import type { ObjectDetector } from "../detect/ObjectDetector";

// Node has no DOM: a canvas stub that records what was drawn, and a minimal ImageData.
let drawn: { width: number; height: number; data: Uint8ClampedArray }[] = [];
class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
beforeEach(() => {
  drawn = [];
  vi.stubGlobal("ImageData", FakeImageData);
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: (img: FakeImageData) => drawn.push(img) }),
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

const { CameraFrameScanner } = await import("../detect/CameraFrameScanner");

function fakeDetector(results: RawDetection[] = []) {
  const calls: unknown[] = [];
  let release: () => void = () => {};
  const detector: ObjectDetector = {
    name: "fake",
    classMap: { book: "book", cup: "cup", keyboard: "keyboard" },
    detect: (canvas) => {
      calls.push(canvas);
      return new Promise((resolve) => (release = () => resolve(results)));
    },
  };
  return { detector, calls, finish: () => release() };
}

/** 2x2 RGBA frame with one padding byte group per row; pixel value = row index. */
const frame = () => {
  const rowBytes = 2 * 4 + 4;
  const pixels = new Uint8Array(rowBytes * 2);
  for (let y = 0; y < 2; y++) pixels.fill(y + 1, y * rowBytes, y * rowBytes + 8);
  return { rows: 2, cols: 2, rowBytes, pixels };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("CameraFrameScanner (detector on AR engine frames)", () => {
  it("runs one inference at a time and at most once per interval", async () => {
    let now = 0;
    const d = fakeDetector();
    const s = new CameraFrameScanner(d.detector, () => {}, { minIntervalMs: 250, now: () => now });
    expect(s.push(frame())).toBe(true);
    expect(s.push(frame())).toBe(false); // busy
    d.finish();
    await flush();
    now = 100;
    expect(s.push(frame())).toBe(false); // too soon
    now = 250;
    expect(s.push(frame())).toBe(true);
    expect(d.calls).toHaveLength(2);
  });

  it("copies padded rows, top row first, and can flip a bottom-up frame", () => {
    const d = fakeDetector();
    new CameraFrameScanner(d.detector, () => {}).push(frame());
    expect([...drawn[0].data]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2]);
    new CameraFrameScanner(d.detector, () => {}, { flipRows: true }).push(frame());
    expect([...drawn[1].data].slice(0, 4)).toEqual([2, 2, 2, 2]);
  });

  it("maps detections into puzzle sightings in frame coordinates", async () => {
    const d = fakeDetector([{ label: "keyboard", score: 0.8, bbox: [0, 0, 1, 1] }]);
    const frames: { sightings: { id: string }[]; frameWidth: number }[] = [];
    const s = new CameraFrameScanner(d.detector, (f) => frames.push(f));
    s.push(frame());
    d.finish();
    await flush();
    expect(frames[0].sightings.map((x) => x.id)).toEqual(["keyboard"]);
    expect(frames[0].frameWidth).toBe(2);
  });

  it("rejects malformed frames and reports nothing after stop()", async () => {
    const d = fakeDetector([{ label: "book", score: 0.9, bbox: [0, 0, 1, 1] }]);
    const seen: unknown[] = [];
    const s = new CameraFrameScanner(d.detector, (f) => seen.push(f));
    expect(s.push({ rows: 2, cols: 2, rowBytes: 4, pixels: new Uint8Array(8) })).toBe(false);
    s.push(frame());
    s.stop();
    d.finish();
    await flush();
    expect(seen).toEqual([]);
    expect(s.push(frame())).toBe(false);
  });
});
