import { expect, test, type Page } from "@playwright/test";

/**
 * Responsive scanner layout at phone and laptop sizes, with a live (fake) camera. The fake
 * stream shows one printed tag whose center is at a known place in the frame, so the drawn
 * overlay can be checked against where the image of the tag actually appears on screen
 * (object-fit: cover crops the frame). This is a layout test, not a real-webcam test.
 */
type Stream = { width: number; height: number };
const TAG_CENTER = { x: 0.3, y: 0.3 }; // normalized, off-center so a missing crop correction shows

async function mockTagCamera(page: Page, stream: Stream) {
  await page.addInitScript(
    ({ stream, center }) => {
      const state = window as typeof window & { cameraTracks: MediaStreamTrack[] };
      state.cameraTracks = [];
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = stream.width;
          canvas.height = stream.height;
          const context = canvas.getContext("2d")!;
          const image = new Image();
          image.src = "/markers/book.svg";
          await image.decode();
          const size = Math.round(Math.min(stream.width, stream.height) * 0.55);
          const draw = () => {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(
              image,
              center.x * stream.width - size / 2,
              center.y * stream.height - size / 2,
              size,
              size,
            );
          };
          draw();
          const media = canvas.captureStream(12);
          state.cameraTracks.push(...media.getTracks());
          const timer = setInterval(() => {
            if (media.getTracks().every((t) => t.readyState === "ended")) clearInterval(timer);
            else draw();
          }, 80);
          return media;
        },
      });
    },
    { stream, center: TAG_CENTER },
  );
}

const VIEWPORTS = [
  { name: "narrow-phone-320x568", width: 320, height: 568, stream: { width: 540, height: 960 } },
  { name: "iphone-portrait-390x844", width: 390, height: 844, stream: { width: 720, height: 1280 } },
  { name: "iphone-landscape-844x390", width: 844, height: 390, stream: { width: 1280, height: 720 } },
  { name: "laptop-1366x768", width: 1366, height: 768, stream: { width: 1280, height: 720 } },
  { name: "desktop-1920x1080", width: 1920, height: 1080, stream: { width: 1280, height: 720 } },
] as const;

for (const vp of VIEWPORTS) {
  test(`scanner layout at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await mockTagCamera(page, vp.stream);
    await page.goto("/");
    await page.getByRole("button", { name: "QR backup" }).click();
    await page.getByRole("button", { name: "Enable camera" }).click();
    await expect(page.getByText("CAMERA LIVE", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".marker-overlay polygon")).toHaveCount(1, { timeout: 15_000 });

    // No horizontal overflow.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const stage = page.locator(".camera-stage");
    await stage.scrollIntoViewIfNeeded();
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".camera-stage") as HTMLElement;
      const video = stage.querySelector("video")!;
      const side = document.querySelector(".scan-side") as HTMLElement;
      const rect = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
      return {
        stage: rect(stage),
        inner: { width: stage.clientWidth, height: stage.clientHeight }, // inside the borders
        video: rect(video),
        side: rect(side),
        panelWidth: (document.querySelector(".scanner-panel") as HTMLElement).clientWidth,
        objectFit: getComputedStyle(video).objectFit,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        polygon: rect(document.querySelector(".marker-overlay polygon")!),
      };
    });

    // The camera is clearly visible but never taller than the screen.
    expect(geometry.stage.height).toBeGreaterThan(150);
    expect(geometry.stage.height).toBeLessThanOrEqual(vp.height);
    // Not stretched: the video fills the stage with object-fit: cover.
    expect(geometry.objectFit).toBe("cover");
    expect(Math.abs(geometry.video.width - geometry.inner.width)).toBeLessThan(1.5);
    expect(Math.abs(geometry.video.height - geometry.inner.height)).toBeLessThan(1.5);
    // Stage shape: the stream's own ratio clamped to 3:4..16:9, or shorter when height-capped.
    const ratio = geometry.video.width / geometry.video.height;
    const target = Math.min(16 / 9, Math.max(3 / 4, vp.stream.width / vp.stream.height));
    expect(ratio).toBeGreaterThanOrEqual(target - 0.02);

    // Overlay alignment: where the tag's center is shown on screen under object-fit: cover.
    const { video: s, videoWidth: vw, videoHeight: vh } = geometry;
    const scale = Math.max(s.width / vw, s.height / vh);
    const expected = {
      x: s.x + TAG_CENTER.x * vw * scale - (vw * scale - s.width) / 2,
      y: s.y + TAG_CENTER.y * vh * scale - (vh * scale - s.height) / 2,
    };
    const drawn = {
      x: geometry.polygon.x + geometry.polygon.width / 2,
      y: geometry.polygon.y + geometry.polygon.height / 2,
    };
    expect(Math.abs(drawn.x - expected.x)).toBeLessThan(8);
    expect(Math.abs(drawn.y - expected.y)).toBeLessThan(8);

    // Checklist beside the camera in a wide panel (container query at 620 px), below it otherwise.
    if (geometry.panelWidth >= 620) expect(geometry.side.x).toBeGreaterThanOrEqual(s.x + s.width - 1);
    else expect(geometry.side.y).toBeGreaterThanOrEqual(s.y + s.height - 1);

    // Clue-word checklist and essential controls are reachable.
    const list = page.getByLabel("Scan checklist");
    for (const word of ["ACCESS", "CONTAINMENT", "KNOWLEDGE"]) {
      const item = list.getByLabel(new RegExp(`^${word}: `));
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport();
    }
    const stop = page.getByRole("button", { name: "Stop camera" });
    await stop.scrollIntoViewIfNeeded();
    await expect(stop).toBeInViewport();
    await expect(stop).toBeEnabled();

    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/layout-${vp.name}.png` });
    await stop.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as typeof window & { cameraTracks: MediaStreamTrack[] }).cameraTracks.every(
            (t) => t.readyState === "ended",
          ),
        ),
      )
      .toBe(true);
  });
}

test("progress survives switching scanners (remount)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTagCamera(page, { width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  await page.getByRole("button", { name: "Enable camera" }).click();
  const list = page.getByLabel("Scan checklist");
  await expect(list.getByLabel("KNOWLEDGE: scanned")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("SIGNAL VERIFIED — 1/3")).toBeVisible();
  await expect(page.getByText(/FIND THE/)).toHaveCount(0);
  // Checklist order is fixed, not the scan order.
  await expect(list.locator("li")).toHaveText([/ACCESS/, /CONTAINMENT/, /KNOWLEDGE/]);
  await page.getByRole("button", { name: "AI scanner" }).click();
  await expect(page.getByLabel("Scan checklist").getByLabel("KNOWLEDGE: scanned")).toBeVisible();
  await page.getByRole("button", { name: "QR backup" }).click();
  await expect(page.getByLabel("Scan checklist").getByLabel("KNOWLEDGE: scanned")).toBeVisible();
  await expect(page.getByLabel("Scan checklist").getByLabel("ACCESS: not scanned")).toBeVisible();
});
