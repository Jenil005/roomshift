# RoomShift Game API (for frontend and AR)

Live at `https://roomshift.app.space`. Types are in `shared/types` and `shared/events`; client helpers in `backend/src/game/client.ts`. The server decides every outcome; clients send requests and render state.

## 1. Requests

1. `POST /api/game` with a JSON `GameRequest`. Every request except `room:create` and a first `room:join` carries `code` and `playerToken`.
2. Replies are `{ ok: true, data }` or `{ ok: false, code, message, retryAfterMs? }`. Show `message`; branch on `code`.
3. `room:create` / `room:join` return `playerToken`. Store it (`saveSession`). Rejoin after a reload with `room:join` + the stored `playerToken`.
4. Send `player:heartbeat` every 5 s while the page is open (`useHeartbeat`). Silent for 15 s = shown as disconnected.

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
5. A wrong arrangement returns `ok: true, data: { solved: false, reason }`. Malformed evidence returns `bad_request` and is not counted.

## 4. Puzzle 2 and finale

1. `puzzle2:draft { order }` updates the shared draft (`room.puzzle2.draft`). `puzzle:submit { puzzle: 2, order }` submits; wrong answers set `retryAfterMs` (3 s, 6 s, 10 s). Hints appear in `room.puzzle2.hints`.
2. `final:press { held: true | false }` on press and release. The door opens when every connected player holds. `room.final.holding` lists who is holding. After `room.final.forceAvailableAt` the host may send `final:force`.
3. Host-only: `game:start`, `intro:skip`, `final:force`, `game:reset` (back to LOBBY for a replay).

## 5. Testing

`node backend/tests/sim/playthrough.mjs [url]` plays a full game with simulated players, including AR-shaped evidence.
