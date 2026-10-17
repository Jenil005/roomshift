// A manually calibrated horizontal floor; this is not detected-plane geometry.
export function calibratedFloorY(cameraY, height) {
  if (!Number.isFinite(cameraY) || !Number.isFinite(height) || height < 0.3 || height > 2.5) return null;
  return cameraY - height;
}

export function floorPlacement(origin, direction, floorY) {
  if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, floorY].every(Number.isFinite)) return null;
  if (direction.y >= -0.08) return null;
  const distance = (floorY - origin.y) / direction.y;
  if (distance < 0.4 || distance > 8) return null;
  const x = origin.x + direction.x * distance;
  const z = origin.z + direction.z * distance;
  if (Math.hypot(origin.x - x, origin.z - z) < 0.25) return null;
  // The open entrance is at local +Z; point it toward the user.
  return {x, y: floorY, z, yaw: Math.atan2(origin.x - x, origin.z - z)};
}
