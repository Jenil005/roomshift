# RoomShift Game API (for frontend and AR)

Live at `https://roomshift.app.space`. Types are in `shared/types` and `shared/events`; client helpers in `backend/src/game/client.ts`. The server decides every outcome; clients send requests and render state.

## 1. Requests

1. `POST /api/game` with a JSON `GameRequest`. Every request except `room:create` and a first `room:join` carries `code` and `playerToken`.
2. Replies are `{ ok: true, data }` or `{ ok: false, code, message, retryAfterMs? }`. Show `message`; branch on `code`.
3. `room:create` / `room:join` return `playerToken`. Store it (`saveSession`). On every page load call `resumeSession()`: it rejoins with the stored token (same seat, role and clues) and clears the session only if the room is gone.
4. Send `player:heartbeat` every 5 s while the page is open (`useHeartbeat`). Silent for 15 s = shown as disconnected. If the host is gone 30 s, host passes to a connected player (`room.hostId` changes).
5. `rate_limited` (HTTP 429) means slow down: wait `retryAfterMs` and retry. `cooldown` (also 429) is a game rule: show a countdown from `retryAfterMs`. `server_error` is safe to retry.

## 2. Live state

1. React pages under `src/pages/(app)/`: `useRoomView(code)` returns the public `Room`, pushed live. Works signed out.
2. Plain pages (the AR room): `GET /api/game/room/:code` returns `{ ok, data: { room } }`. Poll about once per second.
3. `room.systems` = `{ breaker, terminal, door }` drives the AR room's lights. `room.phase` drives screens. `room.events` (with `seq`) drives toasts and sounds.
4. Private clues are never in `room`. Fetch with `room:me` after the phase leaves READY and after a reload.

## 3. Puzzle 1: physical order (BOOK, CUP, KEYS left to right)

1. Pass the AR module's `PhysicalPuzzleResult` straight through:
   ```ts
   gameRequest({ type: 'puzzle:submit', submission: { roomCode: '', playerId: '', puzzle: 1, physical: result } }, session)
   ```
   (`roomCode`/`playerId` are ignored by the server; identity comes from the token.)
2. Camera results: the server re-derives the order from `markers[].center.x` and requires `heldForMs >= 1200`. `solved`, `order` and `detectedIds` from the client are ignored.
3. Manual mode (`source: 'manual'`, `order`) is accepted and recorded as `room.puzzles[1].verifiedBy = 'manual'`, so the UI can say "verified manually".
4. Marker ids match case-insensitively. A QR scan sequence (`scanned`) and a typed initials code (`manualCode: 'BCK'`) still work.
5. A wrong arrangement returns `ok: true, data: { solved: false, reason, retryAfterMs: 1000 }`; submits during that second get `cooldown`. Malformed evidence returns `bad_request` and is not counted.

## 4. Puzzle 2 and finale

1. `puzzle2:draft { order }` updates the shared draft (`room.puzzle2.draft`). `puzzle:submit { puzzle: 2, order }` submits; wrong answers set `retryAfterMs` (3 s, 6 s, 10 s). Hints appear in `room.puzzle2.hints`.
2. `final:press { held: true | false }` on press and release. The door opens when every connected player holds. `room.final.holding` lists who is holding. After `room.final.forceAvailableAt` the host may send `final:force`.
3. Host-only: `game:start`, `intro:skip`, `final:force`, `game:reset` (back to LOBBY for a replay).

## 5. Mission clock

1. `game:start` starts the clock: 8 minutes, or 3 if the room was created with `room:create { demo: true }`. `room.timer` is `{ startedAt, durationMs, deadline, pausedRemainingMs }`; time left is `deadline - serverNow`, or `pausedRemainingMs` while `deadline` is null (paused).
2. At the deadline the server moves the room to `FAILED` (event `game:failed`), even if no phone is sending anything. Play requests then get `wrong_phase`; the host sends `game:reset`.
3. A win freezes the clock (`deadline: null`, `pausedRemainingMs` = time that was left). `game:reset` removes `room.timer`.

## 6. Dev commands (host only)

`dev:command { command }`, for testing. Non-hosts get `not_host`; each use is logged in `room.events` as `dev:used`.

| command | effect |
| --- | --- |
| `{ kind: 'timer:pause' }` / `{ kind: 'timer:resume' }` | freeze / restart the clock |
| `{ kind: 'timer:set', remainingMs }` | set time left, 1 s to 60 min (works while paused) |
| `{ kind: 'fail' }` / `{ kind: 'win' }` | end the mission now as FAILED / COMPLETE |
| `{ kind: 'clear' }` | finish the current stage as if solved (INTRO, either puzzle, a transition, or the finale) |
| `{ kind: 'jump', phase }` | `INTRO`, `PUZZLE_1`, `PUZZLE_2`, `FINAL_SEQUENCE`, `COMPLETE` or `FAILED`, with earlier stages solved. From the lobby it starts the mission without ready checks (2+ players). Jumping back to `PUZZLE_2` keeps the dealt puzzle |

Any room creator is a host, so anyone can use these in their own room. They never affect other rooms.

## 7. Testing

`node backend/tests/sim/playthrough.mjs [url]` plays a full game with simulated players, including AR-shaped evidence.
