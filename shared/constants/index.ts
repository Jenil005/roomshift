// Single source of truth for RoomShift constants. Adjust once DeepSpace patterns are confirmed.

export const MISSION_ID = "blackout-protocol" as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
// Unambiguous uppercase letters (no I or O) for spoken / typed room codes.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const PLAYER_NAME_MAX_LENGTH = 20;

// Physical objects for the P0 puzzle. Each gets a printed QR tag (marker id == object id).
export const OBJECT_IDS = ["book", "cup", "keys"] as const;

// Placeholder role names: rename freely. Roles must differ per player (asymmetric clues).
export const ROLE_IDS = ["engineer", "analyst", "operator", "scout"] as const;

// Presence: clients send player:heartbeat on this interval; the server marks a player
// disconnected when it has heard nothing for DISCONNECT_AFTER_MS.
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const DISCONNECT_AFTER_MS = 15_000;
// A player who stays disconnected this long in LOBBY/READY is removed (no ghost players).
export const LOBBY_DROP_AFTER_MS = 60_000;

// INTRO auto-advances to PUZZLE_1 after this long; the host may skip earlier (intro:skip).
export const INTRO_DURATION_MS = 8_000;

// Rooms with no requests for this long are deleted.
export const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
