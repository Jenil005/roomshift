import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { detectMarkers } from "../detectMarkers";
import { evaluateOrder } from "../physicalOrder";

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
      "ROOMSHIFT:BOOK",
      "ROOMSHIFT:CUP",
      "ROOMSHIFT:KEYS",
    ]);
    const original = pixels.slice();
    const detected = detectMarkers(pixels, width, height);
    expect(detected).toHaveLength(3);
    expect(evaluateOrder(detected)).toEqual({
      status: "holding",
      order: ["BOOK", "CUP", "KEYS"],
    });
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
      "ROOMSHIFT:KEYS",
      "ROOMSHIFT:UNKNOWN",
    ]);
    expect(
      detectMarkers(pixels, width, height).map((marker) => marker.id),
    ).toEqual(["KEYS"]);
  });
  it("retains duplicate identities so validation rejects them", () => {
    const { pixels, width, height } = frame([
      "ROOMSHIFT:BOOK",
      "ROOMSHIFT:BOOK",
      "ROOMSHIFT:KEYS",
    ]);
    expect(evaluateOrder(detectMarkers(pixels, width, height)).status).toBe(
      "duplicate",
    );
  });
  it("returns no markers for blank or invalid frames", () => {
    const { pixels, width, height } = frame([]);
    expect(detectMarkers(pixels, width, height)).toEqual([]);
    expect(detectMarkers(new Uint8ClampedArray(), 10, 10)).toEqual([]);
  });
});
