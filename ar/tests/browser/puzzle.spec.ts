import { expect, test, type Page } from "@playwright/test";

test("manual fallback validates the puzzle, labels the result, and resets", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Manual demo", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Left", exact: true })
    .selectOption("cup");
  await page
    .getByRole("combobox", { name: "Middle", exact: true })
    .selectOption("book");
  await page
    .getByRole("combobox", { name: "Right", exact: true })
    .selectOption("keys");
  await page.getByRole("button", { name: "Check arrangement" }).click();
  await expect(page.getByRole("status")).toContainText("does not match");
  await page
    .getByRole("combobox", { name: "Left", exact: true })
    .selectOption("book");
  await page.getByRole("button", { name: "Check arrangement" }).click();
  await expect(page.getByRole("status")).toContainText("each object once");
  await page
    .getByRole("combobox", { name: "Middle", exact: true })
    .selectOption("cup");
  await page.getByRole("button", { name: "Check arrangement" }).click();
  await expect(
    page.getByRole("heading", { name: "Arrangement matched." }),
  ).toBeVisible();
  await expect(
    page.getByText("Camera verification was not used.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset puzzle" }).click();
  // A reset returns to the default AI scanner; QR backup is one tap away.
  await expect(
    page.getByRole("button", { name: "AI scanner" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "QR backup" }).click();
  await expect(
    page.getByRole("button", { name: "Enable camera" }),
  ).toBeVisible();
});

test("camera permission denial is recoverable without blocking the manual demo", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByRole("alert")).toContainText("Allow camera access");
  await page.getByRole("button", { name: "Try camera again" }).click();
  await expect(page.getByRole("alert")).toContainText("Allow camera access");
  await page.getByRole("button", { name: "Manual demo", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Left", exact: true }),
  ).toBeVisible();
});

async function mockCamera(page: Page) {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      cameraCalls: number;
      cameraTracks: MediaStreamTrack[];
      markerOrder: string[];
      workersStarted: number;
    };
    state.workersStarted = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.workersStarted += 1;
      }
    };
    state.cameraCalls = 0;
    state.cameraTracks = [];
    state.markerOrder = ["cup", "book", "keys"];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        state.cameraCalls += 1;
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 540;
        const context = canvas.getContext("2d")!;
        const images: Record<string, HTMLImageElement> = {};
        for (const id of ["book", "cup", "keys"]) {
          const image = new Image();
          image.src = `/markers/${id}.svg`;
          await image.decode();
          images[id] = image;
        }
        const draw = () => {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          state.markerOrder.forEach((id, index) =>
            context.drawImage(images[id], 30 + index * 310, 120, 280, 280),
          );
        };
        draw();
        const stream = canvas.captureStream(12);
        state.cameraTracks.push(...stream.getTracks());
        const timer = setInterval(() => {
          if (
            stream.getTracks().every((track) => track.readyState === "ended")
          ) {
            clearInterval(timer);
            return;
          }
          draw();
        }, 80);
        return stream;
      },
    });
  });
}

test("camera decodes a live video frame, rejects wrong order, and verifies the corrected scene", async ({
  page,
}) => {
  await mockCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  expect(
    await page.evaluate(
      () => (window as typeof window & { cameraCalls: number }).cameraCalls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByRole("status")).toContainText("Revisit the clues", {
    timeout: 15000,
  });
  await expect(page.locator(".marker-overlay polygon")).toHaveCount(3);
  // Decoding runs in a web worker, and each tag lands once in the scan sequence.
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { workersStarted: number }).workersStarted,
    ),
  ).toBeGreaterThan(0);
  const sequence = page.getByLabel("Scan order");
  for (const label of ["BOOK", "CUP", "KEYS"])
    await expect(sequence).toContainText(label);
  expect((await sequence.textContent())!.match(/BOOK/g)).toHaveLength(1);
  await page.screenshot({
    path: "test-results/camera-puzzle.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("heading", { name: "Connection restored." }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as typeof window & { markerOrder: string[] }).markerOrder = [
      "book",
      "cup",
      "keys",
    ];
  });
  await expect(
    page.getByRole("heading", { name: "Connection restored." }),
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { cameraTracks: MediaStreamTrack[] }
        ).cameraTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
});

test("stopping or changing modes releases camera tracks", async ({ page }) => {
  await mockCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("CAMERA LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { cameraTracks: MediaStreamTrack[] }
        ).cameraTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("CAMERA LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manual demo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { cameraTracks: MediaStreamTrack[] }
        ).cameraTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
});

test("mobile layout fits and printable cards load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Restore the connection." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-puzzle.png",
    fullPage: true,
  });
  await page.goto("/?markers");
  await expect(page.getByRole("img")).toHaveCount(3);
  expect(
    await page
      .getByRole("img")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Print marker cards" }),
  ).toBeHidden();
});

test("a late permission grant after switching modes immediately releases the camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      grantCamera: () => void;
      lateTrack: MediaStreamTrack;
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        new Promise<MediaStream>((resolve) => {
          state.grantCamera = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 100;
            canvas.height = 100;
            const stream = canvas.captureStream();
            state.lateTrack = stream.getVideoTracks()[0];
            resolve(stream);
          };
        }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Connecting to your camera" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manual demo", exact: true }).click();
  await page.evaluate(() =>
    (window as typeof window & { grantCamera: () => void }).grantCamera(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { lateTrack: MediaStreamTrack }).lateTrack
            .readyState,
      ),
    )
    .toBe("ended");
});

test("hiding the page releases camera tracks and requires an explicit restart", async ({
  page,
}) => {
  await mockCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "QR backup" }).click();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("CAMERA LIVE", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("alert")).toContainText("Camera paused");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { cameraTracks: MediaStreamTrack[] }
        ).cameraTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Try camera again" }),
  ).toBeVisible();
});
