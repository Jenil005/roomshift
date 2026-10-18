import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STAGE_ASPECT,
  MAX_STAGE_ASPECT,
  MIN_STAGE_ASPECT,
  stageAspect,
} from "../cameraLayout";
import { coverTransform } from "../detect/geometry";
import { requestCamera, PREFERRED_CAMERA } from "../scan/CameraScanSession";
import { CHECKLIST_ORDER, CLUE_LABEL, SEQUENCE_HINT_TEXT } from "../scan/objectScan";
import { ScanProgress, scanItemState } from "../ScanProgress";
import { MARKER_IDS, PHYSICAL_ORDER, type MarkerId } from "../types";

/** The checklist as rendered: [aria-label, data-state, visible text] per item, in order. */
function checklist(scanned: MarkerId[], pending: MarkerId[] = []) {
  const html = renderToStaticMarkup(
    createElement(ScanProgress, { scanned, pending, notice: null, idleText: "POINT AT ONE OBJECT" }),
  );
  const list = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
  const items = [...list.matchAll(/<li[^>]*aria-label="([^"]*)"[^>]*data-state="([^"]*)"[^>]*>(.*?)<\/li>/g)];
  return {
    list,
    items: items.map(([, label, state, inner]) => ({
      label,
      state,
      text: inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    })),
  };
}

describe("clue-word checklist", () => {
  it("maps each object id to its clue concept", () => {
    expect(CLUE_LABEL).toEqual({ book: "KNOWLEDGE", cup: "CONTAINMENT", keyboard: "ACCESS" });
    expect(Object.keys(CLUE_LABEL).sort()).toEqual([...MARKER_IDS].sort());
  });

  it("uses a fixed order that is not the solution order", () => {
    expect(CHECKLIST_ORDER.map((id) => CLUE_LABEL[id])).toEqual(["ACCESS", "CONTAINMENT", "KNOWLEDGE"]);
    expect([...CHECKLIST_ORDER]).not.toEqual([...PHYSICAL_ORDER]);
    // Internal ids are unchanged.
    expect([...CHECKLIST_ORDER].sort()).toEqual(["book", "cup", "keyboard"]);
  });

  it("starts with every clue word NOT SCANNED, in the neutral order", () => {
    const { items } = checklist([]);
    expect(items.map((i) => i.text)).toEqual([
      "○ ACCESS NOT SCANNED",
      "○ CONTAINMENT NOT SCANNED",
      "○ KNOWLEDGE NOT SCANNED",
    ]);
  });

  it.each([
    ["book", "KNOWLEDGE"],
    ["cup", "CONTAINMENT"],
    ["keyboard", "ACCESS"],
  ] as const)("scanning %s marks %s", (id, word) => {
    const { items } = checklist([id]);
    const done = items.filter((i) => i.state === "accepted");
    expect(done).toHaveLength(1);
    expect(done[0].label).toBe(`${word}: scanned`);
    expect(done[0].text).toBe(`✓ ${word} SCANNED`);
  });

  it("never reorders items as objects are scanned", () => {
    const orders = [[], ["book"], ["book", "cup"], ["book", "cup", "keyboard"], ["keyboard"]].map(
      (scanned) => checklist(scanned as MarkerId[]).items.map((i) => i.label.split(":")[0]),
    );
    for (const order of orders) expect(order).toEqual(["ACCESS", "CONTAINMENT", "KNOWLEDGE"]);
  });

  it("shows a queued scan as SAVING, without the green check, until the server accepts it", () => {
    expect(scanItemState("book", ["book"], ["book"])).toBe("pending");
    expect(scanItemState("book", ["book"], [])).toBe("accepted");
    expect(scanItemState("cup", ["book"], [])).toBe("waiting");
    const pending = checklist(["book"], ["book"]).items.find((i) => i.label.startsWith("KNOWLEDGE"))!;
    expect(pending.state).toBe("pending");
    expect(pending.text).toBe("◌ KNOWLEDGE SAVING…");
    expect(pending.text).not.toContain("✓");
    expect(pending.label).toBe("KNOWLEDGE: saving, not confirmed yet");
  });

  it("counts only accepted scans as progress", () => {
    const html = renderToStaticMarkup(
      createElement(ScanProgress, { scanned: ["book", "cup"], pending: ["cup"], notice: null, idleText: "" }),
    );
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain("PROGRESS 1/3");
    expect(html).toContain("1 SAVING");
  });

  it("renders the same progress after a remount (state comes from the shared progress)", () => {
    expect(checklist(["book", "cup"])).toEqual(checklist(["book", "cup"]));
  });

  it("never names an object in the checklist, visibly or for screen readers", () => {
    for (const scanned of [[], ["book"], ["book", "cup"], ["book", "cup", "keyboard"]] as MarkerId[][]) {
      const { list } = checklist(scanned, scanned.slice(-1));
      expect(list).not.toMatch(/book|cup|keyboard/i);
    }
  });
});

describe("no answer leaks in player-facing scanner text", () => {
  const files = [
    "ar/ScanProgress.tsx",
    "ar/AiScanner.tsx",
    "ar/PhysicalPuzzle.tsx",
    "ar/demo/App.tsx",
    "ar/scan/objectScan.ts",
    "frontend/src/screens/Puzzle1.tsx",
    "frontend/src/facility/FacilityView.tsx",
    "frontend/src/facility/useArScan.ts",
  ];
  /** String and JSX text only (comments stripped), where a spoiler would reach players. */
  const playerText = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it.each(files)("%s has no FIND THE <next object> hint", (path) => {
    expect(playerText(path)).not.toMatch(/FIND THE/i);
  });

  it.each(files)("%s does not spell out the scan order", (path) => {
    expect(playerText(path)).not.toMatch(/book,? (a )?cup,? (and|or) (a )?keyboard/i);
  });

  it("puzzle 1 instructions use the neutral clue hint", () => {
    expect(SEQUENCE_HINT_TEXT).toBe("Use your team's clues to determine the correct scanning sequence.");
    expect(readFileSync("frontend/src/screens/Puzzle1.tsx", "utf8")).toContain("SEQUENCE_HINT_TEXT");
  });
});

describe("camera stage aspect ratio", () => {
  it("follows the stream within 3:4 .. 16:9", () => {
    expect(stageAspect(1280, 720)).toBeCloseTo(16 / 9); // laptop webcam: no cropping
    expect(stageAspect(640, 480)).toBeCloseTo(4 / 3);
    expect(stageAspect(720, 1280)).toBe(MIN_STAGE_ASPECT); // portrait phone: not 9:16 tall
    expect(stageAspect(3000, 1000)).toBe(MAX_STAGE_ASPECT);
    expect(stageAspect(0, 0)).toBe(DEFAULT_STAGE_ASPECT);
  });

  it("maps overlays through the same crop as object-fit: cover", () => {
    // 720x1280 portrait stream in a 300x400 (3:4) stage: scaled to 300x533, 66.7 px cropped top and bottom.
    const toView = coverTransform(720, 1280, 300, 400);
    expect(toView({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    const top = toView({ x: 0, y: 0 });
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-66.67 / 400, 3); // above the visible stage: cropped
    // A box covering the visible band maps exactly onto the stage.
    const visibleTop = 66.67 / 533.33;
    expect(toView({ x: 1, y: visibleTop }).y).toBeCloseTo(0, 3);
    expect(toView({ x: 1, y: 1 - visibleTop }).y).toBeCloseTo(1, 3);
    // Matching aspect ratios (a 16:9 webcam in a 16:9 stage): identity.
    const same = coverTransform(1280, 720, 640, 360);
    expect(same({ x: 0.2, y: 0.7 })).toEqual({ x: 0.2, y: 0.7 });
  });
});

describe("camera selection", () => {
  const named = (name: string) => Object.assign(new Error(name), { name });

  it("prefers the rear camera without requiring one", async () => {
    const getUserMedia = vi.fn().mockResolvedValue("stream");
    await expect(requestCamera({ getUserMedia })).resolves.toBe("stream");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith(PREFERRED_CAMERA);
    const video = PREFERRED_CAMERA.video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" }); // ideal, not exact
  });

  it.each(["OverconstrainedError", "NotFoundError"])(
    "falls back to any camera (a laptop webcam) after %s",
    async (name) => {
      const getUserMedia = vi.fn().mockRejectedValueOnce(named(name)).mockResolvedValue("webcam");
      await expect(requestCamera({ getUserMedia })).resolves.toBe("webcam");
      expect(getUserMedia).toHaveBeenLastCalledWith({ video: true, audio: false });
    },
  );

  it("does not retry a denied permission", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(named("NotAllowedError"));
    await expect(requestCamera({ getUserMedia })).rejects.toThrow("NotAllowedError");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
