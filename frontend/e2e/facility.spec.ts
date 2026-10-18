import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// XR8 here is the AR team's CONTRACT TEST DOUBLE (ar/tests/fixtures/xr8-mock.js): it proves the
// pipeline wiring, permissions flow, placement math and camera hand-off, NOT real SLAM/tracking.
const xr8Mock = readFileSync(fileURLToPath(new URL("../../ar/tests/fixtures/xr8-mock.js", import.meta.url)), "utf8");

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

type MockState = { stops: number; tracksStopped: number; modules: unknown[] };
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
  await a.getByRole("button", { name: "Begin now" }).click();
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

  // Scanner hand-off: XR8 stops and its camera track is released BEFORE the scanner mounts.
  await a.getByRole("button", { name: /SCAN OBJECTS/ }).click();
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
