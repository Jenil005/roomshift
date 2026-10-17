import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PlacementTracker,
  projectedGroundPose,
} from "../public/room/placement.js";

function camera(x = 0, y = 1.6, z = 3) {
  const view = new THREE.PerspectiveCamera(65, 390 / 844, 0.03, 40);
  view.position.set(x, y, z);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld(true);
  return view;
}
const normal = { trackingStatus: "NORMAL", trackingReason: "UNSPECIFIED" };
function hold(tracker, view, from = 0) {
  for (let t = from; t <= from + 1200; t += 100)
    tracker.update(view, normal, t);
}

describe("absolute-scale ground placement", () => {
  it("projects the tracked camera onto the ground, keeping the entrance facing the viewer", () => {
    const front = projectedGroundPose(camera());
    expect(front.position.y).toBeCloseTo(0);
    expect(front.yaw).toBeCloseTo(0);
    const side = projectedGroundPose(camera(3, 1.6, 0));
    expect(side.yaw).toBeCloseTo(Math.PI / 2);
    const back = projectedGroundPose(camera(0, 1.6, -3));
    expect(Math.abs(back.yaw)).toBeCloseTo(Math.PI);
  });
  it("rejects looking upward, invalid camera heights, and distant ground projections", () => {
    const up = camera();
    up.lookAt(0, 5, 0);
    expect(projectedGroundPose(up)).toBeNull();
    expect(projectedGroundPose(camera(0, 0.05, 3))).toBeNull();
    expect(projectedGroundPose(camera(0, 5, 20))).toBeNull();
  });
  it("requires normal tracking and a stable pose before enabling placement", () => {
    const tracker = new PlacementTracker();
    const view = camera();
    tracker.update(view, normal, 0);
    expect(tracker.getReadyPose(0)).toBeNull();
    hold(tracker, view);
    expect(tracker.getReadyPose(1200)).not.toBeNull();
    tracker.update(
      view,
      { trackingStatus: "LIMITED", trackingReason: "INITIALIZING" },
      1300,
    );
    expect(tracker.getReadyPose(1300)).toBeNull();
    tracker.update(view, normal, 1400);
    expect(tracker.getReadyPose(1400)).toBeNull();
  });
  it("invalidates stale poses and resets the placement hold when the camera moves", () => {
    const tracker = new PlacementTracker();
    hold(tracker, camera());
    expect(tracker.getReadyPose(2100)).toBeNull();
    hold(tracker, camera(), 2200);
    tracker.update(camera(2, 1.6, 3), normal, 3500);
    expect(tracker.getReadyPose(3500)).toBeNull();
    for (let t = 3600; t <= 4200; t += 100)
      tracker.update(camera(2, 1.6, 3), normal, t);
    expect(tracker.getReadyPose(4200)).not.toBeNull();
  });
  it("returns a detached placement transform that later camera frames cannot move", () => {
    const tracker = new PlacementTracker();
    hold(tracker, camera());
    const placed = tracker.getReadyPose(1200);
    const original = placed.position.clone();
    tracker.update(camera(2, 1.6, 3), normal, 1300);
    expect(placed.position.equals(original)).toBe(true);
    tracker.reset();
    expect(tracker.getReadyPose(1400)).toBeNull();
  });
});
