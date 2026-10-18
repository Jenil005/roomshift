import { describe, expect, it } from "vitest";
import { ScanDebouncer, ScanSequence, SCAN_DEBOUNCE_MS } from "../scan/ScanSequence";
import { encodeTagPayload, parseTagPayload } from "../scan/tagPayload";
import { MARKER_IDS } from "../types";

describe("tag payload", () => {
  it("round-trips every object id", () => {
    for (const id of MARKER_IDS) {
      expect(encodeTagPayload(id)).toBe(`roomshift:v1:${id}`);
      expect(parseTagPayload(encodeTagPayload(id))).toBe(id);
    }
  });
  it.each([
    "",
    "roomshift:v1:",
    "roomshift:v1:phone",
    "roomshift:v1:BOOK",
    "roomshift:v2:book",
    "ROOMSHIFT:BOOK",
    " roomshift:v1:book",
    "roomshift:v1:book ",
    "roomshift:v1:book:extra",
    "https://example.com/?roomshift:v1:book",
  ])("rejects %j", (payload) => {
    expect(parseTagPayload(payload)).toBeNull();
  });
  it("rejects non-string input without throwing", () => {
    for (const value of [null, undefined, 42, {}, ["roomshift:v1:book"]])
      expect(parseTagPayload(value)).toBeNull();
  });
});

describe("scan debounce", () => {
  it("counts a tag once while it stays in view", () => {
    const debouncer = new ScanDebouncer();
    expect(debouncer.accept("book", 0)).toBe(true);
    for (let t = 120; t <= 5000; t += 120)
      expect(debouncer.accept("book", t)).toBe(false);
  });
  it("re-arms after the tag is out of view for the full window", () => {
    const debouncer = new ScanDebouncer();
    debouncer.accept("cup", 1000);
    expect(debouncer.accept("cup", 1000 + SCAN_DEBOUNCE_MS - 1)).toBe(false);
    expect(debouncer.accept("cup", 1000 + 2 * SCAN_DEBOUNCE_MS)).toBe(true);
  });
  it("tracks tags independently and resets cleanly", () => {
    const debouncer = new ScanDebouncer();
    expect(debouncer.accept("book", 0)).toBe(true);
    expect(debouncer.accept("keyboard", 10)).toBe(true);
    expect(debouncer.accept("book", 20)).toBe(false);
    debouncer.reset();
    expect(debouncer.accept("book", 30)).toBe(true);
  });
  it("treats a clock going backwards as a new scan", () => {
    const debouncer = new ScanDebouncer();
    debouncer.accept("book", 5000);
    expect(debouncer.accept("book", 100)).toBe(true);
  });
});

describe("scan sequence", () => {
  it("keeps scan order, ignores repeats, and clears", () => {
    const sequence = new ScanSequence();
    expect(sequence.append("cup")).toBe(true);
    expect(sequence.append("book")).toBe(true);
    expect(sequence.append("cup")).toBe(false);
    expect(sequence.append("keyboard")).toBe(true);
    expect(sequence.current()).toEqual(["cup", "book", "keyboard"]);
    sequence.clear();
    expect(sequence.current()).toEqual([]);
  });
  it("returns a copy that callers cannot use to mutate it", () => {
    const sequence = new ScanSequence();
    sequence.append("book");
    sequence.current().push("keyboard");
    expect(sequence.current()).toEqual(["book"]);
  });
});
