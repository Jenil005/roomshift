import { describe, expect, it } from "vitest";
import { calibratedFloorY, floorPlacement } from "../facility/placement";
import * as legacy from "../public/room-placement.js";

describe("facility placement (typed port of room-placement.js)", () => {
  it("calibrates a world-space floor from a measured height without assuming y=0", () => {
    expect(calibratedFloorY(2.1, 1.4)).toBeCloseTo(0.7);
    for (const h of [0, -1, 2.6, NaN, Infinity]) expect(calibratedFloorY(1.4, h)).toBeNull();
  });

  it("intersects the floor in meters with the entrance facing the user", () => {
    expect(floorPlacement({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -0.6, z: -0.8 }, 0)).toEqual({ x: 0, y: 0, z: -2, yaw: 0 });
    const rotated = floorPlacement({ x: 2, y: 1.5, z: 3 }, { x: 0.8, y: -0.6, z: 0 }, 0)!;
    expect(rotated.x).toBe(4);
    expect(rotated.yaw).toBe(-Math.PI / 2);
  });

  it("rejects upward, grazing, near, far and invalid rays", () => {
    const camera = { x: 0, y: 1.5, z: 0 };
    for (const ray of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -0.01, z: -1 }, { x: 0, y: -1, z: 0 }, { x: NaN, y: -0.6, z: -0.8 }]) {
      expect(floorPlacement(camera, ray, 0)).toBeNull();
    }
    expect(floorPlacement({ ...camera, y: 20 }, { x: 0, y: -0.6, z: -0.8 }, 0)).toBeNull();
    expect(floorPlacement(camera, { x: 0, y: -0.6, z: -0.8 }, 2)).toBeNull();
  });

  it("matches the legacy implementation on a sweep of rays", () => {
    for (let i = 0; i < 200; i++) {
      const o = { x: Math.sin(i) * 3, y: 1 + (i % 7) * 0.2, z: Math.cos(i * 1.3) * 3 };
      const d = { x: Math.sin(i * 0.7), y: -0.05 - (i % 11) * 0.08, z: Math.cos(i * 0.9) };
      expect(floorPlacement(o, d, 0.1)).toEqual(legacy.floorPlacement(o, d, 0.1));
    }
  });
});
