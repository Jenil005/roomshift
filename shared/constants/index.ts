// Single source of truth for RoomShift constants. Adjust once DeepSpace patterns are confirmed.

export const MISSION_ID = "blackout-protocol" as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
// Unambiguous uppercase letters (no I or O) for spoken / typed room codes.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const PLAYER_NAME_MAX_LENGTH = 20;

// Physical objects for the P0 puzzle. Each gets a printed QR tag (marker id == object id).
// The server matches ids case-insensitively (the AR module uses "BOOK", "CUP", "KEYS").
export const OBJECT_IDS = ["book", "cup", "keys"] as const;
// Camera evidence must show the arrangement held steady this long (matches ar/physicalOrder.ts).
export const PUZZLE1_HOLD_MS = 1_200;
// Short pause after a wrong puzzle 1 attempt so a submit loop cannot flood the room.
export const PUZZLE1_COOLDOWN_MS = 1_000;

// If the host is disconnected this long, the host role passes to a connected player
// (host-only controls such as reset and final:force must never become unreachable).
export const HOST_HANDOFF_AFTER_MS = 30_000;

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

// PUZZLE_1_COMPLETE / PUZZLE_2_COMPLETE show their success state this long, then advance.
export const PHASE_COMPLETE_HOLD_MS = 4_000;

// Puzzle 2 (docs/PUZZLE_2_SPEC.md): cooldown after the 1st, 2nd, and every later wrong try,
// and the wrong-attempt counts that release public hint 1 and hint 2.
export const PUZZLE2_COOLDOWNS_MS = [3_000, 6_000, 10_000] as const;
export const PUZZLE2_HINT_AFTER_ATTEMPTS = [3, 6] as const;

// Final sequence: a release counts as still holding for this long (network jitter grace).
export const FINAL_SYNC_WINDOW_MS = 1_500;
// After this long in FINAL_SEQUENCE the host may force the unlock (final:force).
export const FINAL_FORCE_AFTER_MS = 30_000;

// Rooms with no requests for this long are deleted.
export const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
