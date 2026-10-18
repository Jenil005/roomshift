import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { detectMarkers } from "../detectMarkers";

// Rasterize real QR matrices, including quiet zones, into a single camera frame.
function frame(payloads: string[]) {
  const width = 960;
  const height = 320;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  payloads.forEach((payload, index) => {
    const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
    const scale = 6;
    const left = 50 + index * 300;
    const top = 60;
    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let col = 0; col < qr.modules.size; col += 1) {
        if (!qr.modules.get(row, col)) continue;
        for (let y = 0; y < scale; y += 1)
          for (let x = 0; x < scale; x += 1) {
            const offset =
              ((top + row * scale + y) * width + left + col * scale + x) * 4;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
          }
      }
    }
  });
  return { pixels, width, height };
}

describe("real QR image decoding", () => {
  it("finds all three cards in one image without modifying camera pixels", () => {
    const { pixels, width, height } = frame([
      "roomshift:v1:book",
      "roomshift:v1:cup",
      "roomshift:v1:keyboard",
    ]);
    const original = pixels.slice();
    const detected = detectMarkers(pixels, width, height);
    expect(detected).toHaveLength(3);
    // Sorted left to right only to make the assertion independent of decode order.
    expect(
      [...detected].sort((a, b) => a.center.x - b.center.x).map((m) => m.id),
    ).toEqual(["book", "cup", "keyboard"]);
    expect(
      Buffer.compare(Buffer.from(pixels.buffer), Buffer.from(original.buffer)),
    ).toBe(0);
    expect(
      detected.every((marker) =>
        marker.corners.every(
          (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
        ),
      ),
    ).toBe(true);
  });
  it("ignores unrelated QR data while continuing to find known markers", () => {
    const { pixels, width, height } = frame([
      "https://example.com",
      "roomshift:v1:keyboard",
      "roomshift:v1:unknown",
    ]);
    expect(
      detectMarkers(pixels, width, height).map((marker) => marker.id),
    ).toEqual(["keyboard"]);
  });
  it("retains duplicate identities so the scanner can see both", () => {
    const { pixels, width, height } = frame([
      "roomshift:v1:book",
      "roomshift:v1:book",
      "roomshift:v1:keyboard",
    ]);
    expect(
      detectMarkers(pixels, width, height).filter((m) => m.id === "book"),
    ).toHaveLength(2);
  });
  it("rejects the legacy ROOMSHIFT: payload and wrong-case ids", () => {
    const { pixels, width, height } = frame([
      "ROOMSHIFT:BOOK",
      "roomshift:v1:CUP",
      "roomshift:v1:keyboard",
    ]);
    expect(
      detectMarkers(pixels, width, height).map((marker) => marker.id),
    ).toEqual(["keyboard"]);
  });
  it("returns no markers for blank or invalid frames", () => {
    const { pixels, width, height } = frame([]);
    expect(detectMarkers(pixels, width, height)).toEqual([]);
    expect(detectMarkers(new Uint8ClampedArray(), 10, 10)).toEqual([]);
  });
});
