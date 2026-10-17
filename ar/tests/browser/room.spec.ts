import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

declare global {
  interface Window {
    __engineCameraRequests: number;
    __roomTest: {
      chunks: string[];
      configured: Record<string, unknown>;
      runOptions: Record<string, unknown>;
      status: string;
      reason: string;
      paused: boolean;
      cameraPosition: number[];
      tracksStopped: number;
      cameraFailure: boolean;
      compatible: boolean;
      powerEvents: { powered: boolean; source: string; localOnly: boolean }[];
      snapshot: () => {
        camera: number[];
        position: number[];
        rotation: number;
        scale: number[];
        visible: boolean;
      };
    };
  }
}
async function fakeEngine(page: Page) {
  await page.route("**/vendor/8thwall/xr.js", (route) =>
    route.fulfill({
      path: fileURLToPath(new URL("../fixtures/xr8-mock.js", import.meta.url)),
      contentType: "application/javascript",
    }),
  );
}

test("official distributed engine and SLAM chunk load without starting a camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__engineCameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__engineCameraRequests++;
      throw new Error("Unexpected automatic camera request");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const slamRequest = page.waitForResponse((response) =>
    response.url().endsWith("/vendor/8thwall/xr-slam.js"),
  );
  await page.goto("/ar-room.html");
  expect((await slamRequest).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "START AR", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("#status")).toHaveText("3D PREVIEW · NOT AR");
  // Exercise the real public module factories, without running camera/SLAM.
  const moduleNames = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        XR8: {
          XrController: {
            configure: (options: object) => void;
            pipelineModule: () => { name: string };
          };
          Threejs: {
            configure: (options: object) => void;
            pipelineModule: () => { name: string };
          };
          GlTextureRenderer: { pipelineModule: () => { name: string } };
        };
      }
    ).XR8;
    runtime.XrController.configure({
      disableWorldTracking: false,
      scale: "absolute",
    });
    runtime.Threejs.configure({ renderCameraTexture: false });
    return [
      runtime.GlTextureRenderer.pipelineModule(),
      runtime.Threejs.pipelineModule(),
      runtime.XrController.pipelineModule(),
    ].map((module) => module.name);
  });
  expect(moduleNames).toHaveLength(3);
  expect(
    moduleNames.every((name) => typeof name === "string" && name.length > 0),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/iphone-room-preview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__engineCameraRequests)).toBe(0);
});

test("world-tracking contract: placement, walking, local power, repositioning and stop", async ({
  page,
}) => {
  await fakeEngine(page);
  await page.goto("/ar-room.html");
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "PLACE ROOM", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.__roomTest.configured)).toMatchObject(
    { scale: "absolute", disableWorldTracking: false, imageTargetData: [] },
  );
  expect(await page.evaluate(() => window.__roomTest.runOptions)).toMatchObject(
    { allowedDevices: "MOBILE", cameraConfig: { direction: "BACK" } },
  );
  expect(await page.evaluate(() => window.__roomTest.chunks)).toContain("slam");
  await page.getByRole("button", { name: "PLACE ROOM", exact: true }).click();
  const before = await page.evaluate(() => window.__roomTest.snapshot());
  expect(before.visible).toBe(true);
  expect(before.scale).toEqual([1, 1, 1]);
  await page.evaluate(() => {
    window.__roomTest.cameraPosition = [1.5, 1.6, 3];
  });
  await expect
    .poll(() => page.evaluate(() => window.__roomTest.snapshot().camera[0]))
    .toBe(1.5);
  expect(
    await page.evaluate(() => window.__roomTest.snapshot().position),
  ).toEqual(before.position);
  await page
    .getByRole("button", { name: "RESTORE POWER", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "SIMULATE BLACKOUT" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__roomTest.powerEvents.at(-1)),
  ).toEqual({ powered: true, source: "8thwall", localOnly: true });
  await page.getByRole("button", { name: "REPOSITION", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "RESTORE POWER", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "PLACE ROOM", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "PLACE ROOM", exact: true }).click();
  expect(
    await page.evaluate(() => window.__roomTest.snapshot().position),
  ).not.toEqual(before.position);
  await page.getByRole("button", { name: "STOP AR", exact: true }).click();
  await expect(page.locator("#camera-feed")).toBeHidden();
  expect(
    await page.evaluate(() => window.__roomTest.tracksStopped),
  ).toBeGreaterThan(0);
});

test("limited or stale tracking blocks power and hides the placed facility", async ({
  page,
}) => {
  await fakeEngine(page);
  await page.goto("/ar-room.html");
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "PLACE ROOM", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "PLACE ROOM", exact: true }).click();
  await page.evaluate(() => {
    window.__roomTest.status = "LIMITED";
  });
  await expect(page.locator("#status")).toHaveText("TRACKING LIMITED");
  await expect(
    page.getByRole("button", { name: "RESTORE POWER", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.__roomTest.snapshot().visible)).toBe(
    false,
  );
  await page.evaluate(() => {
    window.__roomTest.status = "NORMAL";
  });
  await expect(
    page.getByRole("button", { name: "RESTORE POWER", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    window.__roomTest.paused = true;
  });
  await expect(page.locator("#status")).toHaveText("TRACKING LIMITED");
  expect(await page.evaluate(() => window.__roomTest.snapshot().visible)).toBe(
    false,
  );
});

test("Safari motion denial and camera failure have recoverable messages", async ({
  page,
}) => {
  await fakeEngine(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: { requestPermission: async () => "denied" },
    });
  });
  await page.goto("/ar-room.html");
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await expect(page.locator("#instructions")).toContainText(
    "Motion access was denied",
  );
  await page.evaluate(() => {
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: { requestPermission: async () => "granted" },
    });
    window.__roomTest.cameraFailure = true;
  });
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("CAMERA ACCESS FAILED");
  await expect(
    page.getByRole("button", { name: "START AR", exact: true }),
  ).toBeEnabled();
});

test("backgrounding Safari clears placement and stops camera instead of silently resuming", async ({
  page,
}) => {
  await fakeEngine(page);
  await page.goto("/ar-room.html");
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "PLACE ROOM", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#status")).toHaveText("AR PAUSED");
  await expect(page.locator("#camera-feed")).toBeHidden();
  expect(
    await page.evaluate(() => window.__roomTest.tracksStopped),
  ).toBeGreaterThan(0);
});

test("missing binary fails visibly; preview and license links remain available", async ({
  page,
}) => {
  await page.route("**/vendor/8thwall/xr.js", (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar-room.html");
  await expect(page.locator("#status")).toHaveText("AR ENGINE UNAVAILABLE");
  await expect(
    page.getByRole("button", { name: "RELOAD TO RETRY" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "3D PREVIEW", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("3D PREVIEW · NOT AR");
  await expect(
    page.getByText("Physical iPhone validation pending.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/room-attribution.html");
  await expect(
    page.getByRole("link", { name: "XR Engine License Agreement" }),
  ).toBeVisible();
  expect((await page.request.get("/vendor/8thwall/LICENSE")).status()).toBe(
    200,
  );
  expect((await page.request.get("/vendor/three/LICENSE.txt")).status()).toBe(
    200,
  );
});

test("canceling during the motion prompt prevents late permission from starting the camera", async ({
  page,
}) => {
  await fakeEngine(page);
  await page.addInitScript(() => {
    const state = window as unknown as { grantMotion: () => void };
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: {
        requestPermission: () =>
          new Promise<string>((resolve) => {
            state.grantMotion = () => resolve("granted");
          }),
      },
    });
  });
  await page.goto("/ar-room.html");
  await page.getByRole("button", { name: "START AR", exact: true }).click();
  await page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { grantMotion: () => void }).grantMotion(),
  );
  await expect(page.locator("#status")).toHaveText("AR STOPPED");
  expect(await page.evaluate(() => window.__roomTest.runOptions)).toBeNull();
  await expect(page.locator("#camera-feed")).toBeHidden();
});

test("an insecure origin cannot start camera tracking", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "isSecureContext", { value: false }),
  );
  await page.goto("/ar-room.html");
  await expect(page.locator("#status")).toHaveText("HTTPS REQUIRED");
  await expect(
    page.getByRole("button", { name: "HTTPS REQUIRED", exact: true }),
  ).toBeDisabled();
});
