import { expect, test, type Page } from "@playwright/test";

// Headless Chromium needs SwiftShader for WebGL, which the TensorFlow.js backend uses.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  },
});

type CameraWindow = typeof window & {
  cameraCalls: number;
  cameraTracks: MediaStreamTrack[];
  showKeys: boolean;
};

/**
 * Fake rear camera: crops of two real CC0 photos (a book on the left, a mug in the middle;
 * see ar/tests/fixtures/README.md) with the printed KEYS QR tag on the right when
 * `window.showKeys` is true. The real self-hosted COCO-SSD model runs on these frames.
 */
async function mockPhotoCamera(page: Page) {
  await page.addInitScript(() => {
    const state = window as CameraWindow;
    state.cameraCalls = 0;
    state.cameraTracks = [];
    state.showKeys = false;
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
        const [book, mug, keys] = await Promise.all([
          load("/ar/tests/fixtures/book.jpg"),
          load("/ar/tests/fixtures/mug.jpg"),
          load("/markers/keys.svg"),
        ]);
        const draw = () => {
          context.fillStyle = "#6f5a46";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(book, 330, 160, 300, 420, 67, 40, 286, 400);
          context.drawImage(mug, 500, 160, 340, 240, 430, 120, 340, 240);
          if (state.showKeys) {
            context.fillStyle = "#ffffff";
            context.fillRect(890, 110, 260, 260);
            context.drawImage(keys, 900, 120, 240, 240);
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
  });
}

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

test("real COCO-SSD finds the book and mug, KEYS needs its QR tag, then the hybrid arrangement verifies", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await mockPhotoCamera(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start AI camera" })
    .click({ timeout: 60_000 });
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible();
  const chips = page.getByLabel("Detected objects");
  await expect(chips.getByLabel("BOOK: detected by AI")).toBeVisible({
    timeout: 60_000,
  });
  await expect(chips.getByLabel("CUP: detected by AI")).toBeVisible();
  await expect(chips.getByLabel("KEYS: needs QR tag")).toBeVisible();
  await expect(page.locator(".ai-overlay g.ai")).not.toHaveCount(0);
  // Labels carry the model's confidence, e.g. "BOOK 87%".
  await expect(page.locator(".ai-overlay g.ai text").first()).toHaveText(
    /^(BOOK|CUP) \d{2,3}%$/,
  );
  await page.screenshot({ path: "test-results/ai-book-cup.png", fullPage: true });

  // AI alone never completes the puzzle: book and cup are seen, keys are not.
  await page.waitForTimeout(3000);
  await expect(
    page.getByRole("heading", { name: "Connection restored." }),
  ).toHaveCount(0);

  await page.evaluate(() => {
    (window as CameraWindow).showKeys = true;
  });
  await expect(chips.getByLabel("KEYS: detected by QR tag")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Connection restored." }),
  ).toBeVisible({ timeout: 60_000 });
  const evidence = page.getByLabel("Evidence");
  await expect(evidence).toContainText("BOOK · AI");
  await expect(evidence).toContainText("CUP · AI");
  await expect(evidence).toContainText("KEYS · QR");
  await expect.poll(() => tracksEnded(page)).toBe(true);
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
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible();
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
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible();
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
  await expect(page.getByText("AI LIVE", { exact: true })).toBeVisible();
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
