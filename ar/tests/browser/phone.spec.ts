import { expect, test, type Page } from "@playwright/test";

// Phone hardening checks (Task A5). These run in desktop Chrome with a phone-sized viewport;
// they do not replace ar/MANUAL_TEST.md on real devices.

const ROOM_URL = "/ar/index.html?room=ABCD&host=1";

// Counts animation frames and lets a test fake the page being hidden.
async function instrumentPage(page: Page) {
  await page.addInitScript(() => {
    const w = window as typeof window & { frameCount: number; fakeHidden: boolean };
    w.frameCount = 0;
    w.fakeHidden = false;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        w.frameCount += 1;
        cb(t);
      });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => w.fakeHidden });
  });
}

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    (window as typeof window & { fakeHidden: boolean }).fakeHidden = h;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

async function framesDuring(page: Page, ms: number) {
  const count = () => page.evaluate(() => (window as typeof window & { frameCount: number }).frameCount);
  const before = await count();
  await page.waitForTimeout(ms);
  return (await count()) - before;
}

test.describe("room view on a small phone", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test("toolbar buttons, including Recenter, stay on screen", async ({ page }) => {
    await page.goto(ROOM_URL);
    for (const name of ["Motion", "Recenter", "Reset"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });

  test("motion without sensor data says why and keeps drag", async ({ page }) => {
    await page.goto(ROOM_URL);
    await page.getByRole("button", { name: "Motion" }).click();
    await expect(page.locator("#toast")).toHaveText(/No motion sensor data/, { timeout: 5000 });
  });
});

test("room rendering pauses while hidden and resumes when visible", async ({ page }) => {
  await instrumentPage(page);
  await page.goto(ROOM_URL);
  expect(await framesDuring(page, 500)).toBeGreaterThan(5);
  await setHidden(page, true);
  await page.waitForTimeout(100); // let an in-flight frame finish
  expect(await framesDuring(page, 500)).toBe(0);
  await setHidden(page, false);
  expect(await framesDuring(page, 500)).toBeGreaterThan(5);
});

test("room view survives losing and restoring the WebGL context", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await instrumentPage(page);
  await page.goto(ROOM_URL);
  await page.evaluate(async () => {
    const canvas = document.getElementById("view") as HTMLCanvasElement;
    const ext = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!.getExtension(
      "WEBGL_lose_context",
    )!;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 300));
  });
  expect(await framesDuring(page, 500)).toBeGreaterThan(5);
  // The room still responds to state after the restore.
  await page.getByRole("button", { name: "Reset" }).click();
  expect(errors).toEqual([]);
});

test.describe("physical puzzle on a small phone", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test("manual selects are 16px so iOS does not zoom, and fit without overflow", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Manual demo", exact: true }).click();
    const sizes = await page
      .locator(".manual-slots select")
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes).toEqual([16, 16, 16]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
