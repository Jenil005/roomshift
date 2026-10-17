import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calibratedFloorY, floorPlacement} from '../public/room-placement.js';

test('measured camera height calibrates a world-space floor without assuming y=0', () => {
  assert.equal(calibratedFloorY(2.1, 1.4), 2.1 - 1.4);
  for (const height of [0, -1, 2.6, NaN, Infinity]) assert.equal(calibratedFloorY(1.4, height), null);
});
test('center ray intersects floor in meters and entrance faces user', () => {
  const p = floorPlacement({x: 0, y: 1.5, z: 0}, {x: 0, y: -0.6, z: -0.8}, 0);
  assert.deepEqual(p, {x: 0, y: 0, z: -2, yaw: 0});
  const rotated = floorPlacement({x: 2, y: 1.5, z: 3}, {x: 0.8, y: -0.6, z: 0}, 0);
  assert.equal(rotated.x, 4);
  assert.equal(rotated.yaw, -Math.PI / 2);
});
test('rejects upward, grazing, near, far and invalid rays', () => {
  const camera = {x: 0, y: 1.5, z: 0};
  for (const ray of [{x:0,y:1,z:0}, {x:0,y:-0.01,z:-1}, {x:0,y:-1,z:0}, {x:NaN,y:-0.6,z:-0.8}]) {
    assert.equal(floorPlacement(camera, ray, 0), null);
  }
  assert.equal(floorPlacement({...camera,y:20}, {x:0,y:-0.6,z:-0.8}, 0), null);
  assert.equal(floorPlacement(camera, {x:0,y:-0.6,z:-0.8}, 2), null);
});
