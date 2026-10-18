import { expect, test, type Page } from "@playwright/test";

// Role reveal waits for the host's Proceed (no auto-advance); the mission clock then counts
// down from 08:00, the same on every phone, and survives a reload. Live backend required.

const clock = (p: Page) => p.getByRole("timer", { name: "Mission time remaining" });
/** Remaining seconds shown, read together with that page's wall clock (one evaluate, no gap). */
const reading = (p: Page) =>
  p.evaluate(() => {
    const [m, s] = document.querySelector("[role=timer]")!.textContent!.split(":").map(Number);
    return { left: m * 60 + s, at: Date.now() };
  });
/** Wall-clock time the shown countdown implies the mission started at. Equal across phones when in sync. */
const impliedStart = ({ left, at }: { left: number; at: number }) => at - (480 - left) * 1000;

test("host-only Proceed starts a synchronized 8-minute countdown", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("/");
  await a.getByPlaceholder("Maya").fill("Ana");
  await a.getByRole("button", { name: "Create room" }).click();
  const code = (await a.getByRole("heading", { name: /^Room [A-Z]{4}$/ }).textContent())!.replace("Room ", "");
  await b.goto(`/?room=${code}`);
  await b.getByPlaceholder("Maya").fill("Ben");
  await b.getByRole("button", { name: "Join" }).click();
  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Start mission" }).click();

  // Role reveal: roles + private clues, Proceed for the host only, no timer anywhere.
  await expect(a.getByText("Your fragment")).toBeVisible();
  await expect(b.getByText("Your fragment")).toBeVisible();
  await expect(b.getByText("Waiting for host to proceed...")).toBeVisible();
  await expect(b.getByRole("button", { name: "Proceed" })).toHaveCount(0);
  await expect(a.getByRole("timer")).toHaveCount(0);
  await expect(b.getByRole("timer")).toHaveCount(0);

  // Longer than the old 8 s intro timer: nobody leaves role reveal on their own.
  await a.waitForTimeout(9_500);
  await expect(a.getByText("Your fragment")).toBeVisible();
  await expect(b.getByText("Waiting for host to proceed...")).toBeVisible();
  await expect(a.getByText("Puzzle 1 of 3")).toHaveCount(0);

  await a.getByRole("button", { name: "Proceed" }).click();
  await expect(a.getByText("Puzzle 1 of 3")).toBeVisible();
  await expect(b.getByText("Puzzle 1 of 3")).toBeVisible();
  await expect(clock(a)).toHaveText(/^0(8:00|7:5\d)$/);

  // Counts down, and both phones agree. Pages are compared through the start time their
  // display implies (a slow machine can take seconds between two reads).
  const firstA = await reading(a);
  await a.waitForTimeout(3_000);
  const laterA = await reading(a);
  const laterB = await reading(b);
  expect(laterA.left).toBeLessThan(firstA.left);
  expect(laterA.left).toBeLessThanOrEqual(480);
  expect(Math.abs(impliedStart(laterA) - impliedStart(laterB))).toBeLessThanOrEqual(1_500);

  // Reload B: the countdown continues where it was instead of restarting at 08:00.
  await b.reload();
  await expect(b.getByText("Puzzle 1 of 3")).toBeVisible();
  await expect(clock(b)).toBeVisible();
  const reloadedB = await reading(b);
  expect(reloadedB.left).toBeLessThan(480);
  expect(Math.abs(impliedStart(reloadedB) - impliedStart(laterA))).toBeLessThanOrEqual(1_500);

  await ctxA.close();
  await ctxB.close();
});
