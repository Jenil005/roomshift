import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Real models on real CC0 photos (ar/tests/fixtures/README.md), in the production build,
// through the tester diagnostics page. Desktop Chromium with software WebGL: this proves the
// adapters, box format and class mapping, NOT iPhone accuracy or speed.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

const fixture = (name: string) => fileURLToPath(new URL(`../../ar/tests/fixtures/${name}`, import.meta.url));
type Raw = { label: string; score: number; bbox: [number, number, number, number] };
type Result = { name: string; ms: number; detections: Raw[] };
// The scanner feeds detectors a canvas at most 640 px wide; both fixtures are 960 px wide.
const FRAME = { book: [640, 427], mug: [640, 360] } as const;

test("MediaPipe and COCO-SSD: real detections, same coordinate space, no keys class", async ({ page }) => {
  test.setTimeout(240_000);
  await page.route("**/__fixtures/*.jpg", (route) => route.fulfill({ path: fixture(route.request().url().split("/").pop()!) }));
  await page.goto("/diagnostics.html");
  const run = (kind: string, url: string) =>
    page.evaluate(([k, u]) => (window as unknown as { __detectImage(k: string, u: string): Promise<Result> }).__detectImage(k, u), [kind, url] as const);
  const top = (r: Result, label: string) => [...r.detections].filter((d) => d.label === label).sort((a, b) => b.score - a.score)[0];
  const center = (d: Raw, [w, h]: readonly number[]) => ({ x: (d.bbox[0] + d.bbox[2] / 2) / w, y: (d.bbox[1] + d.bbox[3] / 2) / h });

  const results: Record<string, { book: Result; mug: Result }> = {};
  for (const kind of ["mediapipe", "coco"]) {
    results[kind] = { book: await run(kind, "/__fixtures/book.jpg"), mug: await run(kind, "/__fixtures/mug.jpg") };
    const { book, mug } = results[kind];
    console.log(`${book.name}: book=${top(book, "book")?.score.toFixed(3)} cup=${top(mug, "cup")?.score.toFixed(3)} (${Math.round(book.ms)} ms, ${Math.round(mug.ms)} ms)`);
    for (const [r, [w, h]] of [[book, FRAME.book], [mug, FRAME.mug]] as const) {
      expect(r.detections.some((d) => /^keys?$/i.test(d.label))).toBe(false); // no detector here has keys
      for (const d of r.detections) {
        const [x, y, bw, bh] = d.bbox;
        expect(bw).toBeGreaterThan(0);
        expect(bh).toBeGreaterThan(0);
        // Pixels of the input canvas; models may overshoot an edge slightly (bboxToMarker clamps).
        expect(x).toBeGreaterThan(-0.02 * w);
        expect(y).toBeGreaterThan(-0.02 * h);
        expect(x + bw).toBeLessThan(1.02 * w);
        expect(y + bh).toBeLessThan(1.02 * h);
        expect(d.score).toBeGreaterThan(0);
        expect(d.score).toBeLessThanOrEqual(1);
      }
    }
  }
  const mp = results.mediapipe;
  const coco = results.coco;
  expect(mp.book.name).toMatch(/^MediaPipe EfficientDet-Lite0 \((GPU|CPU)\)$/);
  expect(top(mp.book, "book")!.score).toBeGreaterThan(0.35); // MEDIAPIPE_CONFIDENCE.book
  expect(top(mp.mug, "cup")!.score).toBeGreaterThan(0.4); // MEDIAPIPE_CONFIDENCE.cup
  // Both detectors place the same object at the same normalized position: the box format,
  // scaling and origin are interpreted identically.
  for (const [img, label] of [["book", "book"], ["mug", "cup"]] as const) {
    const a = center(top(mp[img], label)!, FRAME[img]);
    const b = center(top(coco[img], label)!, FRAME[img]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.12);
  }
});
