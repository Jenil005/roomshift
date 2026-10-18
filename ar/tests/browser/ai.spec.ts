import { expect, test, type Page } from "@playwright/test";

// Headless Chromium needs SwiftShader for WebGL, which the TensorFlow.js backend uses.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  },
});

type CameraView = "none" | "book" | "mug" | "keyboard-tag" | "book+mug";
type CameraWindow = typeof window & {
  cameraCalls: number;
  cameraTracks: MediaStreamTrack[];
  view: CameraView;
};

/**
 * Fake rear camera showing one thing at a time (`window.view`): a crop of a real CC0 book
 * photo, a real CC0 mug photo (ar/tests/fixtures/README.md), the printed KEYBOARD QR tag,
 * book and mug together, or an empty table. The real self-hosted COCO-SSD model runs on
 * these frames. There is no keyboard photo fixture yet, so KEYBOARD is scanned by its tag.
 */
async function mockPhotoCamera(page: Page, view: CameraView = "none") {
  await page.addInitScript((initial: CameraView) => {
    const state = window as CameraWindow;
    state.cameraCalls = 0;
    state.cameraTracks = [];
    state.view = initial;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        state.cameraCalls += 1;
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 480;
        const context = canvas.getContext("2d")!;
        const load = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const [book, mug, keyboard] = await Promise.all([
          load("/ar/tests/fixtures/book.jpg"),
          load("/ar/tests/fixtures/mug.jpg"),
          load("/markers/keyboard.svg"),
        ]);
        const draw = () => {
          context.fillStyle = "#6f5a46";
          context.fillRect(0, 0, canvas.width, canvas.height);
          if (state.view === "book" || state.view === "book+mug")
            context.drawImage(book, 330, 160, 300, 420, 67, 40, 286, 400);
          if (state.view === "mug" || state.view === "book+mug")
            context.drawImage(mug, 500, 160, 340, 240, 430, 120, 340, 240);
          if (state.view === "keyboard-tag") {
            context.fillStyle = "#ffffff";
            context.fillRect(510, 110, 260, 260);
            context.drawImage(keyboard, 520, 120, 240, 240);
          }
        };
        draw();
        const stream = canvas.captureStream(10);
        state.cameraTracks.push(...stream.getTracks());
        const timer = setInterval(() => {
          if (stream.getTracks().every((t) => t.readyState === "ended")) {
            clearInterval(timer);
            return;
          }
          draw();
        }, 100);
        return stream;
      },
    });
  }, view);
}

const show = (page: Page, view: CameraView) =>
  page.evaluate((v) => {
    (window as CameraWindow).view = v;
  }, view);

const tracksEnded = (page: Page) =>
  page.evaluate(() =>
    (window as CameraWindow).cameraTracks.every((t) => t.readyState === "ended"),
  );

test("AI scanner is the default and does not open the camera before a tap", async ({
  page,
}) => {
  await mockPhotoCamera(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "AI scanner" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("INITIALIZING AI", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start AI camera" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("CAMERA READY", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as CameraWindow).cameraCalls)).toBe(0);
});

test("real COCO-SSD scans BOOK then CUP one at a time; scans persist off-frame; KEYBOARD by tag completes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await mockPhotoCamera(page, "book+mug");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start AI camera" })
    .click({ timeout: 60_000 });
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible({ timeout: 20_000 });
  const list = page.getByLabel("Scan checklist");
  const progress = page.getByRole("progressbar", { name: "Signals verified" });

  // Two new objects in one frame: nothing is recorded, the player is asked for one.
  await expect(page.getByText(/IN VIEW — SCAN ONE OBJECT AT A TIME/)).toBeVisible({ timeout: 60_000 });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".ai-overlay g.ai text").first()).toHaveText(/^(BOOK|CUP) \d{2,3}%$/);

  // BOOK alone: scanned at once (no hold); the notice counts signals, never names the next object.
  // The notice shows for SCAN_NOTICE_HOLD_MS (2.5 s) and then yields to "ALREADY SCANNED", so
  // it is awaited first: on a slow machine (1+ s per inference) it would otherwise be gone.
  await show(page, "book");
  await expect(page.getByText("SIGNAL VERIFIED — 1/3")).toBeVisible({ timeout: 30_000 });
  await expect(list.getByLabel("KNOWLEDGE: scanned")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");

  // The book leaves the frame: it stays scanned.
  await show(page, "none");
  await page.waitForTimeout(1500);
  await expect(list.getByLabel("KNOWLEDGE: scanned")).toBeVisible();

  // CUP alone, without the book in view.
  await show(page, "mug");
  await expect(page.getByText("SIGNAL VERIFIED — 2/3")).toBeVisible({ timeout: 30_000 });
  await expect(list.getByLabel("CONTAINMENT: scanned")).toBeVisible();
  await expect(page.getByText(/FIND THE/)).toHaveCount(0);
  await expect(list.getByLabel("KNOWLEDGE: scanned")).toBeVisible();
  await expect(list.getByLabel("ACCESS: not scanned")).toBeVisible();

  // BOOK again: a duplicate, not new progress.
  await show(page, "book");
  await expect(page.getByText("BOOK ALREADY SCANNED")).toBeVisible({ timeout: 30_000 });
  await expect(progress).toHaveAttribute("aria-valuenow", "2");
  await page.screenshot({ path: "test-results/ai-sequential-2of3.png", fullPage: true });

  // No keyboard photo fixture yet: finish with the KEYBOARD tag in QR backup. Progress
  // survives the mode switch, and the AI camera is released first.
  await page.getByRole("button", { name: "QR backup" }).click();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await expect(page.getByLabel("Scan checklist").getByLabel("CONTAINMENT: scanned")).toBeVisible();
  await show(page, "keyboard-tag");
  await page.getByRole("button", { name: /Enable camera/ }).click();
  await expect(
    page.getByRole("heading", { name: "Connection restored." }),
  ).toBeVisible({ timeout: 60_000 });
  const evidence = page.getByLabel("Evidence");
  await expect(evidence).toContainText("BOOK · AI");
  await expect(evidence).toContainText("CUP · AI");
  await expect(evidence).toContainText("KEYBOARD · QR");
  await expect.poll(() => tracksEnded(page)).toBe(true);
});

test("an out-of-sequence first scan is rejected and resets the local attempt", async ({ page }) => {
  test.setTimeout(150_000);
  await mockPhotoCamera(page, "mug");
  await page.goto("/");
  await page.getByRole("button", { name: "Start AI camera" }).click({ timeout: 60_000 });
  await expect(page.getByText("CUP SCANNED OUT OF SEQUENCE — START AGAIN")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("progressbar", { name: "Signals verified" })).toHaveAttribute("aria-valuenow", "0");
  await show(page, "book");
  await expect(page.getByLabel("Scan checklist").getByLabel("KNOWLEDGE: scanned")).toBeVisible({ timeout: 30_000 });
});

test("a model that fails to load offers QR Backup immediately", async ({ page }) => {
  await page.route("**/models/coco-ssd/**", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/");
  await expect(page.getByText("SWITCH TO QR BACKUP", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("could not be loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry AI" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to QR backup" }).click();
  await expect(page.getByRole("button", { name: "QR backup" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Enable camera" })).toBeVisible();
});

test("a model that takes longer than 15 s offers QR Backup while it keeps loading", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route("**/models/coco-ssd/**/model.json", () => {
    // Never answer: simulates a stalled download.
  });
  await page.goto("/");
  await expect(page.getByText("INITIALIZING AI", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to QR backup" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("taking longer than expected")).toBeVisible();
});

test("switching from AI to QR backup and to manual releases the camera", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockPhotoCamera(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start AI camera" })
    .click({ timeout: 60_000 });
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "QR backup" }).click();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("CAMERA LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AI scanner" }).click();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  // The model stays loaded: no second "Initializing" wait.
  await expect(page.getByRole("button", { name: "Start AI camera" })).toBeVisible({
    timeout: 2000,
  });
  await page.getByRole("button", { name: "Start AI camera" }).click();
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Manual demo", exact: true }).click();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  expect(await page.evaluate(() => (window as CameraWindow).cameraCalls)).toBe(3);
});

test("hiding the page stops the AI camera and needs an explicit restart", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockPhotoCamera(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start AI camera" })
    .click({ timeout: 60_000 });
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("alert")).toContainText("Camera paused");
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Restart AI camera" })).toBeVisible();
});

test("AI mode fits a 320 px portrait screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start AI camera" })).toBeVisible({
    timeout: 60_000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/ai-320.png", fullPage: true });
});
