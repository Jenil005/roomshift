// Types for the legacy plain-JS module (used by ar-room.html); ar/facility/placement.ts is the typed port.
export function calibratedFloorY(cameraY: number, height: number): number | null;
export function floorPlacement(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  floorY: number,
): { x: number; y: number; z: number; yaw: number } | null;
