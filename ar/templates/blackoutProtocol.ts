import type { SystemId } from "../types";

// A room template is pure data. Both devices build the identical room from it,
// so "same room" never depends on camera input. Add new missions by adding templates.
export interface RoomTemplate {
  id: string;
  name: string;
  size: { w: number; h: number; d: number }; // meters
  eyeHeight: number;
  palette: {
    wall: string;
    floor: string;
    ceiling: string;
    line: string;
    emergency: number;
    online: number;
    ok: number;
    accent: number;
  };
  hints: Record<SystemId, [number, number, number]>; // bobbing "tap here" marker positions
}

export const blackoutProtocol: RoomTemplate = {
  id: "blackout-protocol",
  name: "Blackout Protocol: Research Facility Control Room",
  size: { w: 8, h: 3.2, d: 8 },
  eyeHeight: 1.6,
  palette: {
    wall: "#161d27",
    floor: "#0e1319",
    ceiling: "#10161e",
    line: "#243445",
    emergency: 0xff2a2a,
    online: 0x38e8ff,
    ok: 0x39ff88,
    accent: 0xffb020,
  },
  hints: {
    breaker: [0, 2.55, -3.45],
    terminal: [3.35, 1.95, 0],
    door: [0, 2.85, 3.45],
  },
};
