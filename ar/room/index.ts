// Shared AR room entry point (three.js). Import from "ar/room" so pages that only need the
// physical puzzle do not pull in three.js. See ar/README.md "Frontend integration".
export { RoomScene } from "./RoomScene";
export { LookControls } from "./LookControls";
export { blackoutProtocol, type RoomTemplate } from "../templates/blackoutProtocol";
export type { RoomSync } from "../sync/RoomSync";
export { LocalSync } from "../sync/LocalSync"; // same-browser testing only, never across phones
export {
  SYSTEM_ORDER,
  initialRoomState,
  type PeerPresence,
  type RoomState,
  type SystemId,
} from "../types";
