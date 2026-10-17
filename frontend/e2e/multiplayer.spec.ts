import { expect, test, type Page } from "@playwright/test";

/** Two separate browser contexts = two phones with separate storage. */
test("two browsers share one live room with separate private clues", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const apiCalls: string[] = [];
  a.on("request", (r) => r.url().includes("/api/game") && apiCalls.push(r.url()));

  await a.goto("/");
  await expect(a.getByText("ROOMSHIFT · MULTIPLAYER")).toBeVisible();
  await a.getByPlaceholder("Maya").fill("Ana");
  await a.getByRole("button", { name: "Create room" }).click();
  const heading = a.getByRole("heading", { name: /^Room [A-Z]{4}$/ });
  await expect(heading).toBeVisible();
  const code = (await heading.textContent())!.replace("Room ", "");
  expect(apiCalls.every((u) => !u.startsWith("http://127.0.0.1:4173"))).toBe(true); // cross-origin API

  await b.goto(`/?room=${code}`);
  await b.getByPlaceholder("Maya").fill("Ben");
  await b.getByRole("button", { name: "Join" }).click();
  await expect(b.getByText("Ben (you)")).toBeVisible();
  await expect(a.getByText("Ben", { exact: true })).toBeVisible(); // A sees B via polling

  // Real server error surfaced in the UI.
  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await expect(a.getByText("Everyone is ready. The host can start the mission.")).toBeVisible();
  await a.getByRole("button", { name: "Start mission" }).click();

  await expect(a.getByText("Your fragment")).toBeVisible();
  await expect(b.getByText("Your fragment")).toBeVisible();
  const fragment = async (p: Page) => (await p.locator(".bevel-paper").innerText()).replace("Your fragment", "").trim();
  const clueA = await fragment(a);
  const clueB = await fragment(b);
  expect(clueA).not.toBe("");
  expect(clueA).not.toBe(clueB);
  await expect(a.getByText(clueB)).toHaveCount(0); // never shown on the other phone

  // Reload B: same seat, same clue, no duplicate player.
  await b.reload();
  await expect(b.getByText("Your fragment")).toBeVisible();
  expect(await fragment(b)).toBe(clueB);

  // Non-host cannot skip; host can.
  await expect(b.getByRole("button", { name: "Begin now" })).toHaveCount(0);
  await a.getByRole("button", { name: "Begin now" }).click();
  await expect(a.getByText("Puzzle 1 of 3")).toBeVisible();
  await expect(b.getByText("Puzzle 1 of 3")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
