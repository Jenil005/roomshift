import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// XR8 here is the AR team's CONTRACT TEST DOUBLE (ar/tests/fixtures/xr8-mock.js): it proves the
// pipeline wiring, permissions flow, placement math and camera hand-off, NOT real SLAM/tracking.
const xr8Mock = readFileSync(fileURLToPath(new URL("../../ar/tests/fixtures/xr8-mock.js", import.meta.url)), "utf8");
const fixture = (name: string) => fileURLToPath(new URL(`../../ar/tests/fixtures/${name}`, import.meta.url));

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

type MockState = {
  stops: number;
  tracksStopped: number;
  modules: { name: string }[];
  pixelFrames: number;
  pixelOptions?: { maxDimension?: number };
  cameraPixels: { rows: number; cols: number; rowBytes: number; pixels: Uint8Array } | null;
};
type DebugWindow = Window & {
  __roomTest: MockState;
  __roomshiftFacility?: {
    debugSnapshot(): { visible: boolean; position: number[]; placed: boolean; ar: boolean };
    screenPointOf(match: (h: { kind: string; id?: string }) => boolean): { x: number; y: number } | null;
  };
  gumCalls: number;
};

async function twoPlayersInPuzzle1(browser: Browser) {
  // Chromium now exposes the iOS-style motion permission API; grant it as a player would.
  const ctxA = await browser.newContext({ permissions: ["accelerometer", "gyroscope", "magnetometer"] });
  const ctxB = await browser.newContext();
  await ctxA.addInitScript({ content: xr8Mock });
  await ctxA.route("**/__fixtures/*.jpg", (route) => route.fulfill({ path: fixture(route.request().url().split("/").pop()!) }));
  await ctxA.addInitScript(() => {
    const w = window as unknown as DebugWindow;
    w.gumCalls = 0;
    const real = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (real) Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: (c: MediaStreamConstraints) => (w.gumCalls++, real(c)) });
  });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto("/?debug");
  // Software WebGL on CI-class machines is slow: use the low-effects mode (also covers it).
  await a.evaluate(() => localStorage.setItem("roomshift.fx", "low"));
  await a.getByPlaceholder("Maya").fill("Ana");
  await a.getByRole("button", { name: "Create room" }).click();
  const code = (await a.getByRole("heading", { name: /^Room [A-Z]{4}$/ }).textContent())!.replace("Room ", "");
  await b.goto(`/?room=${code}`);
  await b.getByPlaceholder("Maya").fill("Ben");
  await b.getByRole("button", { name: "Join" }).click();
  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Start mission" }).click();
  await a.getByRole("button", { name: "Proceed" }).click();
  await expect(b.getByText("Puzzle 1 of 3")).toBeVisible();
  return { a, b, close: async () => (await ctxA.close(), await ctxB.close()) };
}

const snapshot = (p: Page) => p.evaluate(() => (window as unknown as DebugWindow).__roomshiftFacility!.debugSnapshot());
const mock = (p: Page) => p.evaluate(() => {
  const s = (window as unknown as DebugWindow).__roomTest;
  return { stops: s.stops, tracksStopped: s.tracksStopped };
});

async function startAndPlace(a: Page) {
  await a.getByRole("button", { name: "START AR" }).click();
  await expect(a.getByText("AR · WORLD TRACKING")).toBeVisible({ timeout: 20_000 });
  await a.getByRole("button", { name: "CALIBRATE FLOOR" }).click({ timeout: 10_000 }); // after 1.5 s of normal tracking
  await expect(a.getByRole("button", { name: "PLACE FACILITY" })).toBeVisible({ timeout: 10_000 });
  // The double's camera is 1.6 m above y=0; the default 1.40 m entry puts the floor estimate
  // at 0.2 m. Placement uses that manual estimate, exactly as on a phone.
  await a.getByRole("button", { name: "PLACE FACILITY" }).click();
  await expect.poll(async () => (await snapshot(a)).placed).toBe(true);
}

test("facility: preview is labeled NOT AR, AR places it, scanner hand-off releases the XR camera, server state drives it, 3D taps edit the shared terminal", async ({ browser }) => {
  const { a, b, close } = await twoPlayersInPuzzle1(browser);

  await a.getByRole("button", { name: "FACILITY · AR" }).click();
  await expect(a.getByText("3D PREVIEW · NOT AR", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText("BREAKER OFFLINE")).toBeVisible();

  await startAndPlace(a);
  const placed = await snapshot(a);
  expect(placed.visible).toBe(true);
  expect(placed.ar).toBe(true);

  // Full-scanner hand-off (QR backup / manual): XR8 stops and releases its camera BEFORE the scanner mounts.
  await a.getByRole("button", { name: /FULL SCANNER/ }).click();
  await expect(a.getByText("Breaker: scan sequence")).toBeVisible();
  const afterScan = await mock(a);
  expect(afterScan.stops).toBeGreaterThanOrEqual(1);
  expect(afterScan.tracksStopped).toBeGreaterThanOrEqual(1);
  expect(await a.evaluate(() => (window as unknown as DebugWindow).gumCalls)).toBe(0); // scanner waits for a tap

  // Back into AR (second XR8.run in the same page), then B solves puzzle 1 by manual report.
  await a.getByRole("button", { name: "FACILITY · AR" }).click();
  await startAndPlace(a);
  await b.getByRole("button", { name: "Manual report", exact: true }).click();
  const slots = b.locator(".manual-slots select");
  await slots.nth(0).selectOption("book");
  await slots.nth(1).selectOption("cup");
  await slots.nth(2).selectOption("keyboard");
  await b.getByRole("button", { name: /Report sequence/ }).click();
  await expect(a.getByText("BREAKER ONLINE")).toBeVisible(); // server state reached A's AR view
  expect((await snapshot(a)).placed).toBe(true); // a state change never moves the placed room

  // Puzzle 2: a tap on a 3D terminal panel becomes a puzzle2:draft request.
  await expect(a.getByText("Comms terminal: tap its panels")).toBeVisible({ timeout: 15_000 });
  // Walk to the middle of the facility and turn toward the terminal on the right wall.
  await a.evaluate(() => {
    const s = (window as unknown as DebugWindow).__roomTest as unknown as { cameraPosition: number[]; cameraTarget: number[] };
    s.cameraPosition = [0, 1.6, 0.4];
    s.cameraTarget = [1.6, 1.55, 0.3];
  });
  await a.waitForTimeout(300);
  const point = await a.evaluate(() =>
    (window as unknown as DebugWindow).__roomshiftFacility!.screenPointOf((h) => h.kind === "module" && h.id === "database"),
  );
  expect(point).not.toBeNull();
  expect(point!.x).toBeGreaterThan(0);
  expect(point!.x).toBeLessThan(390);
  await a.mouse.click(point!.x, point!.y);
  await expect(a.getByText(/ORDER: DATABASE/)).toBeVisible();
  await expect(b.getByRole("button", { name: /^DATABASE/ })).toHaveAttribute("aria-pressed", "true"); // shared

  // Leaving the facility releases the XR camera again.
  const before = await mock(a);
  await a.getByRole("button", { name: "BACK TO MISSION" }).click();
  await expect(a.getByText("Comms boot sequence")).toBeVisible();
  expect((await mock(a)).stops).toBeGreaterThan(before.stops);

  await close();
});

/**
 * Feeds the XR8 double's camera with one view: a crop of a real CC0 book or mug photo
 * (ar/tests/fixtures/README.md) on a table-coloured frame, or nothing. The real COCO-SSD
 * model runs on these AR frames.
 */
async function arCameraSees(p: Page, view: "book" | "mug" | "none") {
  await p.evaluate(async (v) => {
    const state = (window as unknown as DebugWindow).__roomTest;
    if (v === "none") {
      state.cameraPixels = null;
      return;
    }
    const image = new Image();
    image.src = `/__fixtures/${v}.jpg`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#6f5a46";
    ctx.fillRect(0, 0, 640, 480);
    if (v === "book") ctx.drawImage(image, 330, 160, 300, 420, 177, 40, 286, 400);
    else ctx.drawImage(image, 500, 160, 340, 240, 150, 120, 340, 240);
    const data = ctx.getImageData(0, 0, 640, 480).data;
    state.cameraPixels = { rows: 480, cols: 640, rowBytes: 640 * 4, pixels: new Uint8Array(data.buffer.slice(0)) };
  }, view);
}

test("scan in AR: objects are scanned from the AR camera feed without leaving AR or opening a second camera", async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b, close } = await twoPlayersInPuzzle1(browser);
  await a.getByRole("button", { name: "FACILITY · AR" }).click();
  await expect(a.getByText("3D PREVIEW · NOT AR", { exact: true })).toBeVisible({ timeout: 30_000 });
  await startAndPlace(a);
  const stopsBefore = (await mock(a)).stops;

  await a.getByRole("button", { name: /SCAN IN AR 0\/3/ }).click();
  await expect(a.getByText("Point the phone at ONE object.")).toBeVisible({ timeout: 90_000 }); // model loaded
  const tap = await a.evaluate(() => {
    const s = (window as unknown as DebugWindow).__roomTest;
    return { names: s.modules.map((m) => m.name), maxDimension: s.pixelOptions?.maxDimension };
  });
  expect(tap.names).toEqual(expect.arrayContaining(["camerapixelarray", "roomshift-scan-tap"]));
  expect(tap.maxDimension).toBe(640);

  const card = a.getByLabel("Object scan progress");
  await arCameraSees(a, "book");
  await expect(card.getByLabel("KNOWLEDGE: scanned")).toBeVisible({ timeout: 60_000 });
  await expect(a.getByText("SIGNAL VERIFIED — 1/3")).toBeVisible();
  await expect(a.getByText(/SEEING: BOOK \d+%/)).toBeVisible();

  await arCameraSees(a, "none");
  await a.waitForTimeout(1000);
  await arCameraSees(a, "mug");
  await expect(card.getByLabel("CONTAINMENT: scanned")).toBeVisible({ timeout: 60_000 });
  await expect(card.getByLabel("KNOWLEDGE: scanned")).toBeVisible(); // stays scanned out of view
  await expect(card.getByLabel("ACCESS: not scanned")).toBeVisible();
  await a.screenshot({ path: "test-results/facility-scan-in-ar.png" });

  // AR kept running the whole time, the facility stayed placed, and no second camera opened.
  await expect(a.getByText("AR · WORLD TRACKING")).toBeVisible();
  expect((await snapshot(a)).placed).toBe(true);
  expect((await mock(a)).stops).toBe(stopsBefore);
  expect(await a.evaluate(() => (window as unknown as DebugWindow).gumCalls)).toBe(0);

  // The progress is the server's: B's scanner shows it too.
  await expect(b.getByLabel("Scan checklist").getByLabel("CONTAINMENT: scanned")).toBeVisible({ timeout: 15_000 });

  // STOP SCANNING removes the frame tap (no more pixel reads).
  await a.getByRole("button", { name: "STOP SCANNING" }).click();
  await expect
    .poll(() => a.evaluate(() => (window as unknown as DebugWindow).__roomTest.modules.map((m) => m.name)))
    .not.toContain("camerapixelarray");

  // B finishes with a manual report; A's AR view powers up.
  await b.getByRole("button", { name: "Manual report", exact: true }).click();
  const slots = b.locator(".manual-slots select");
  await slots.nth(0).selectOption("book");
  await slots.nth(1).selectOption("cup");
  await slots.nth(2).selectOption("keyboard");
  await b.getByRole("button", { name: /Report sequence/ }).click();
  await expect(a.getByText("BREAKER ONLINE")).toBeVisible({ timeout: 15_000 });
  await close();
});
