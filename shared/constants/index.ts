// Single source of truth for RoomShift constants. Adjust once DeepSpace patterns are confirmed.

export const MISSION_ID = "blackout-protocol" as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;

// Physical objects for the P0 puzzle. Each gets a printed QR tag (marker id == object id).
export const OBJECT_IDS = ["book", "cup", "keys"] as const;

// Placeholder role names: rename freely. Roles must differ per player (asymmetric clues).
export const ROLE_IDS = ["engineer", "analyst", "operator", "scout"] as const;
