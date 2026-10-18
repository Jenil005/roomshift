import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { allOrders, describe as describeConstraint, MODULES, MODULE_LABEL, satisfies, type Constraint, type ModuleId } from "../../shared/puzzles/commsBoot";

// Headless Chromium needs SwiftShader for WebGL, which the TensorFlow.js backend uses.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

const fixture = (name: string) => fileURLToPath(new URL(`../../ar/tests/fixtures/${name}`, import.meta.url));

/**
 * Fake rear camera (as in ar/tests/browser/ai.spec.ts) showing one thing at a time, set by
 * `window.view`: a crop of a real CC0 book photo, a real CC0 mug photo, or the printed
 * KEYBOARD QR tag (there is no keyboard photo fixture yet). The real self-hosted COCO-SSD
 * model and QR decoder run on these frames.
 */
async function fakeCamera(context: BrowserContext) {
  await context.route("**/__fixtures/*.jpg", (route) => route.fulfill({ path: fixture(route.request().url().split("/").pop()!) }));
  await context.addInitScript(() => {
    const w = window as typeof window & { cameraTracks: MediaStreamTrack[]; view: string };
    w.cameraTracks = [];
    w.view = "none";
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 480;
        const ctx = canvas.getContext("2d")!;
        const load = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const [book, mug, keyboard] = await Promise.all([load("/__fixtures/book.jpg"), load("/__fixtures/mug.jpg"), load("/markers/keyboard.svg")]);
        const draw = () => {
          ctx.fillStyle = "#6f5a46";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (w.view === "book") ctx.drawImage(book, 330, 160, 300, 420, 67, 40, 286, 400);
          if (w.view === "mug") ctx.drawImage(mug, 500, 160, 340, 240, 430, 120, 340, 240);
          if (w.view === "keyboard-tag") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(510, 110, 260, 260);
            ctx.drawImage(keyboard, 520, 120, 240, 240);
          }
        };
        draw();
        const stream = canvas.captureStream(10);
        w.cameraTracks.push(...stream.getTracks());
        const timer = setInterval(() => (stream.getTracks().every((t) => t.readyState === "ended") ? clearInterval(timer) : draw()), 100);
        return stream;
      },
    });
  });
}

/** Players pool their notes out loud; this finds the one boot order all notes allow. */
function solve(lines: string[]): ModuleId[] {
  const all: Constraint[] = [];
  for (const a of MODULES) {
    all.push({ kind: "notFirst", a }, { kind: "notLast", a }, { kind: "first", a }, { kind: "last", a });
    for (const b of MODULES) if (a !== b) all.push({ kind: "before", a, b });
  }
  const byText = new Map(all.map((c) => [describeConstraint(c), c]));
  const cs = lines.map((l) => byText.get(l)).filter((c): c is Constraint => !!c);
  expect(cs).toHaveLength(lines.length);
  const fits = allOrders().filter((o) => cs.every((c) => satisfies(o, c)));
  expect(fits).toHaveLength(1);
  return fits[0];
}

const paperLines = async (p: Page) => (await p.locator(".bevel-paper p").allInnerTexts()).map((t) => t.trim()).filter(Boolean);

test("two browsers play a full live mission: private clues, rejoin, sequential object scans, shared terminal, joint hold", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await fakeCamera(ctxA);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const apiCalls: string[] = [];
  a.on("request", (r) => r.url().includes("/api/game") && apiCalls.push(r.url()));

  // DETECTOR=mediapipe|auto runs the same mission with another detector (default: COCO-SSD).
  await a.goto(process.env.DETECTOR ? `/?detector=${process.env.DETECTOR}` : "/");
  await expect(a.getByText("ROOMSHIFT · MULTIPLAYER")).toBeVisible();
  await a.getByPlaceholder("Maya").fill("Ana");
  await a.getByRole("button", { name: "Create room" }).click();
  const heading = a.getByRole("heading", { name: /^Room [A-Z]{4}$/ });
  await expect(heading).toBeVisible();
  const code = (await heading.textContent())!.replace("Room ", "");
  expect(apiCalls.length).toBeGreaterThan(0);
  expect(apiCalls.every((u) => !u.startsWith("http://127.0.0.1:4173"))).toBe(true); // cross-origin API

  await b.goto(`/?room=${code}`);
  await b.getByPlaceholder("Maya").fill("Ben");
  await b.getByRole("button", { name: "Join" }).click();
  await expect(b.getByText("Ben (you)")).toBeVisible();
  await expect(a.getByText("Ben", { exact: true })).toBeVisible(); // A sees B via polling

  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await expect(a.getByText("Everyone is ready. The host can start the mission.")).toBeVisible();
  await a.getByRole("button", { name: "Start mission" }).click();

  // Private clues: each phone sees only its own.
  await expect(a.getByText("Your fragment")).toBeVisible();
  await expect(b.getByText("Your fragment")).toBeVisible();
  const clueA = (await paperLines(a)).join(" ");
  const clueB = (await paperLines(b)).join(" ");
  expect(clueA).not.toBe("");
  expect(clueA).not.toBe(clueB);
  await expect(a.getByText(clueB)).toHaveCount(0);

  // Reload B: same seat, same clue.
  await b.reload();
  await expect(b.getByText("Your fragment")).toBeVisible();
  expect((await paperLines(b)).join(" ")).toBe(clueB);

  await expect(b.getByRole("button", { name: "Begin now" })).toHaveCount(0); // host only
  await a.getByRole("button", { name: "Begin now" }).click();
  await expect(b.getByText("Puzzle 1 of 3")).toBeVisible();

  // B files a wrong manual report: the SERVER rejects it.
  await b.getByRole("button", { name: "Manual report", exact: true }).click();
  const slots = b.locator(".manual-slots select");
  await slots.nth(0).selectOption("cup");
  await slots.nth(1).selectOption("book");
  await slots.nth(2).selectOption("keyboard");
  await b.getByRole("button", { name: /Report sequence/ }).click();
  await expect(b.getByRole("alert").filter({ hasText: "Wrong order" })).toBeVisible();

  // A scans one object at a time. COCO-SSD recognizes the real book, then the real mug.
  const view = (v: string) => a.evaluate((x) => ((window as unknown as { view: string }).view = x), v);
  const scannedA = a.getByLabel("Scanned objects");
  await expect(a.getByRole("button", { name: /Start AI camera/ })).toBeVisible({ timeout: 60_000 });
  await a.getByRole("button", { name: /Start AI camera/ }).click();
  await view("book");
  await expect(scannedA.getByLabel("BOOK: scanned")).toBeVisible({ timeout: 60_000 });
  await expect(scannedA.getByLabel("BOOK: scanned")).not.toContainText("SAVING", { timeout: 15_000 }); // server accepted
  // A reloads the page: the seat comes back and BOOK is still scanned (stored on the server).
  await a.reload();
  await expect(scannedA.getByLabel("BOOK: scanned")).toBeVisible({ timeout: 30_000 });
  await expect(scannedA.getByLabel("CUP: not scanned")).toBeVisible();
  await a.getByRole("button", { name: /Start AI camera/ }).click({ timeout: 60_000 });
  await view("mug");
  await expect(scannedA.getByLabel("CUP: scanned")).toBeVisible({ timeout: 60_000 });
  await expect(scannedA.getByLabel("BOOK: scanned")).toBeVisible(); // still scanned, out of view
  // B's phone shows the shared progress from the server (in the facility HUD).
  await b.getByRole("button", { name: /FACILITY/ }).click();
  await expect(b.getByText("✓ CUP SCANNED")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText("○ KEYBOARD NOT SCANNED")).toBeVisible();
  await b.getByRole("button", { name: "BACK TO MISSION" }).click();
  // No keyboard photo fixture yet: A finishes with the KEYBOARD tag in QR backup.
  await a.getByRole("button", { name: "QR backup" }).click();
  await expect(scannedA.getByLabel("CUP: scanned")).toBeVisible(); // progress survives the mode switch
  await view("keyboard-tag");
  await a.getByRole("button", { name: /Enable camera/ }).click();
  await expect(a.getByText("BREAKER RESTORED — PUZZLE COMPLETE")).toBeVisible({ timeout: 60_000 });
  await expect(a.getByText(/Verified from scanned objects/)).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText(/Verified from scanned objects/)).toBeVisible();
  // The scanner released the camera once the evidence was accepted.
  await expect.poll(() => a.evaluate(() => (window as unknown as { cameraTracks: MediaStreamTrack[] }).cameraTracks.every((t) => t.readyState === "ended"))).toBe(true);

  // Puzzle 2: pool both players' notes, build the order on the shared terminal.
  await expect(a.getByText("Comms boot sequence")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText("Comms boot sequence")).toBeVisible();
  await expect(a.getByText("Receiving notes…")).toHaveCount(0);
  await expect(b.getByText("Receiving notes…")).toHaveCount(0);
  const order = solve([...(await paperLines(a)), ...(await paperLines(b))]);
  for (const [i, m] of order.entries()) {
    const p = i % 2 ? b : a; // both phones edit the same draft
    await p.getByRole("button", { name: new RegExp(`^${MODULE_LABEL[m]}`) }).click();
    await expect(p.getByRole("button", { name: new RegExp(`^${MODULE_LABEL[m]}`) })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(b.getByText(`slot ${MODULES.length}`)).toBeVisible();
  await b.getByRole("button", { name: "Boot terminal" }).click();

  // Final: both hold at once.
  await expect(a.getByText("Blast door override")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText("Blast door override")).toBeVisible();
  const press = async (p: Page) => {
    const box = (await p.getByRole("button", { name: /activate/i }).boundingBox())!;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
  };
  await press(a);
  await expect(b.getByText("Hands on the panel · 1 of 2")).toBeVisible();
  await press(b);
  await expect(a.getByRole("heading", { name: /POWER\s*RESTORED/ })).toBeVisible();
  await expect(b.getByRole("heading", { name: /POWER\s*RESTORED/ })).toBeVisible();
  await expect(a.getByText("Open")).toBeVisible();

  // Host reset returns everyone to the lobby.
  await a.getByRole("button", { name: "Run it again" }).click();
  await expect(b.getByRole("button", { name: "Ready up" })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
