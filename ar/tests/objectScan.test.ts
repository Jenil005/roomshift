import { describe, expect, it } from "vitest";
import { mapDetections, scanCandidates, type RawDetection } from "../detect/objectClasses";
import {
  addedScans,
  alreadyScannedText,
  crowdedText,
  decideFrame,
  LocalScanJudge,
  signalVerifiedText,
} from "../scan/objectScan";
import type { MarkerId } from "../types";

const W = 640;
const H = 360;
const det = (label: string, score: number, x = 200): RawDetection => ({
  label,
  score,
  bbox: [x, 100, 160, 140],
});
/** One camera frame of raw COCO output -> the scan candidates the scanner acts on. */
const frame = (...raw: RawDetection[]) => scanCandidates(mapDetections(raw, W, H).sightings);

/** Plays frames against a progress list the way the scanner and its host do together. */
function play(frames: RawDetection[][]) {
  let scanned: MarkerId[] = [];
  const reports: MarkerId[] = [];
  const decisions = frames.map((raw) => {
    const decision = decideFrame(frame(...raw), scanned);
    if (decision.kind === "report") {
      reports.push(decision.scan.id);
      scanned = [...scanned, decision.scan.id];
    }
    return decision;
  });
  return { scanned, reports, decisions };
}

describe("sequential scanning (one object per frame)", () => {
  it("marks BOOK scanned from a single confident frame, with no hold", () => {
    const { scanned, decisions } = play([[det("book", 0.62)]]);
    expect(scanned).toEqual(["book"]);
    expect(decisions[0]).toEqual({ kind: "report", scan: { id: "book", evidence: "ai", score: 0.62 } });
  });

  it("keeps BOOK scanned after it leaves the frame, then scans CUP and KEYBOARD on their own", () => {
    const { scanned, reports } = play([
      [det("book", 0.7)],
      [], // camera moved away: nothing in view
      [det("cup", 0.8)], // BOOK is no longer visible
      [det("person", 0.9)], // detector loses everything relevant
      [det("keyboard", 0.75)], // CUP is no longer visible
    ]);
    expect(scanned).toEqual(["book", "cup", "keyboard"]);
    expect(reports).toEqual(["book", "cup", "keyboard"]);
  });

  it("a repeat sighting is a duplicate, never new progress", () => {
    const { reports, decisions } = play([[det("book", 0.7)], [det("book", 0.9)], [det("book", 0.8)]]);
    expect(reports).toEqual(["book"]);
    expect(decisions.slice(1)).toEqual([
      { kind: "duplicate", id: "book" },
      { kind: "duplicate", id: "book" },
    ]);
    expect(alreadyScannedText("book")).toBe("BOOK ALREADY SCANNED");
  });

  it("an already scanned object in view does not block the next one", () => {
    const { reports } = play([[det("book", 0.7)], [det("book", 0.7, 20), det("cup", 0.8, 400)]]);
    expect(reports).toEqual(["book", "cup"]);
  });

  it("rejects low-confidence and unrelated detections", () => {
    const { reports, decisions } = play([
      [det("book", 0.46)], // shown by the display threshold, too weak to scan
      [det("cup", 0.52)],
      [det("keyboard", 0.3)],
      [det("laptop", 0.95), det("cell phone", 0.9)],
    ]);
    expect(reports).toEqual([]);
    expect(decisions.every((d) => d.kind === "none")).toBe(true);
  });

  it("two new objects in one frame record nothing and ask for one at a time", () => {
    const { reports, decisions } = play([[det("book", 0.7, 20), det("cup", 0.8, 400)]]);
    expect(reports).toEqual([]);
    expect(decisions[0]).toEqual({ kind: "crowded", ids: ["book", "cup"] });
    expect(crowdedText(["book", "cup"])).toBe("BOOK + CUP IN VIEW — SCAN ONE OBJECT AT A TIME");
  });

  it("works with AI evidence only: no QR code is involved", () => {
    const { decisions } = play([[det("book", 0.7)], [det("cup", 0.8)], [det("keyboard", 0.8)]]);
    expect(decisions.map((d) => d.kind === "report" && d.scan.evidence)).toEqual(["ai", "ai", "ai"]);
  });
});

describe("scan messages", () => {
  it("counts verified signals without naming the next object", () => {
    expect(signalVerifiedText(1)).toBe("SIGNAL VERIFIED — 1/3");
    expect(signalVerifiedText(2)).toBe("SIGNAL VERIFIED — 2/3");
    expect(signalVerifiedText(3)).toBe("SIGNAL VERIFIED — 3/3");
    for (const n of [1, 2, 3]) expect(signalVerifiedText(n)).not.toMatch(/FIND|BOOK|CUP|KEYBOARD/);
  });

  it("detects newly added scans, including a teammate's", () => {
    expect(addedScans(["book"], ["book", "cup"])).toEqual(["cup"]);
    expect(addedScans(["book", "cup"], [])).toEqual([]); // a reset adds nothing
  });
});

describe("LocalScanJudge (standalone demo)", () => {
  it("accepts the sequence, ignores duplicates, and resets on a wrong object", () => {
    const judge = new LocalScanJudge();
    expect(judge.record("book")).toBe("accepted");
    expect(judge.record("book")).toBe("duplicate");
    expect(judge.record("keyboard")).toBe("wrong");
    expect(judge.current()).toEqual([]);
    expect(judge.record("book")).toBe("accepted");
    expect(judge.record("cup")).toBe("accepted");
    expect(judge.record("keyboard")).toBe("solved");
    expect(judge.current()).toEqual(["book", "cup", "keyboard"]);
  });
});
