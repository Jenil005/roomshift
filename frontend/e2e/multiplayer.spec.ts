import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { allOrders, describe as describeConstraint, MODULES, MODULE_LABEL, satisfies, type Constraint, type ModuleId } from "../../shared/puzzles/commsBoot";

// Headless Chromium needs SwiftShader for WebGL, which the TensorFlow.js backend uses.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

const fixture = (name: string) => fileURLToPath(new URL(`../../ar/tests/fixtures/${name}`, import.meta.url));

/**
 * Fake rear camera (same as ar/tests/browser/ai.spec.ts): crops of two real CC0 photos, a book
 * on the left and a mug in the middle, and the printed KEYS QR tag on the right. The real
 * self-hosted COCO-SSD model and QR decoder run on these frames.
 */
async function fakeCamera(context: BrowserContext) {
  await context.route("**/__fixtures/*.jpg", (route) => route.fulfill({ path: fixture(route.request().url().split("/").pop()!) }));
  await context.addInitScript(() => {
    const w = window as typeof window & { cameraTracks: MediaStreamTrack[] };
    w.cameraTracks = [];
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
        const [book, mug, keys] = await Promise.all([load("/__fixtures/book.jpg"), load("/__fixtures/mug.jpg"), load("/markers/keys.svg")]);
        const draw = () => {
          ctx.fillStyle = "#6f5a46";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(book, 330, 160, 300, 420, 67, 40, 286, 400);
          ctx.drawImage(mug, 500, 160, 340, 240, 430, 120, 340, 240);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(890, 110, 260, 260);
          ctx.drawImage(keys, 900, 120, 240, 240);
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

test("two browsers play a full live mission: private clues, rejoin, camera evidence, shared terminal, joint hold", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await fakeCamera(ctxA);
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
  await slots.nth(2).selectOption("keys");
  await b.getByRole("button", { name: /Check arrangement/ }).click();
  await expect(b.getByRole("alert").filter({ hasText: "Wrong order" })).toBeVisible();

  // A scans the real arrangement: COCO-SSD sees book + cup, the QR tag gives keys.
  await expect(a.getByRole("button", { name: /Start AI camera/ })).toBeVisible({ timeout: 60_000 });
  await a.getByRole("button", { name: /Start AI camera/ }).click();
  await expect(a.getByText("Verified from camera evidence")).toBeVisible({ timeout: 60_000 });
  await expect(b.getByText("Verified from camera evidence")).toBeVisible();
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
