# RoomShift Game API (for frontend and AR)

Live at `https://roomshift.app.space`. Types are in `shared/types` and `shared/events`. The game players use is `frontend/` (Netlify), a different origin: its client is `frontend/src/game/client.ts` over `transport.ts`. Pages served by the backend itself can use the helpers in `backend/src/game/client.ts`. The server decides every outcome; clients send requests and render state.

CORS is open on `/api/*` (`Access-Control-Allow-Origin: *`, preflight allows `POST` and `content-type`). There are no cookies: identity is the `playerToken` in the request body, so no secret ever ships in the client.

## 1. Requests

1. `POST /api/game` with a JSON `GameRequest`. Every request except `room:create` and a first `room:join` carries `code` and `playerToken`.
2. Replies are `{ ok: true, data }` or `{ ok: false, code, message, retryAfterMs? }`. Show `message`; branch on `code`.
3. `room:create` / `room:join` return `playerToken`. Store it (`saveSession`). On every page load call `resumeSession()`: it rejoins with the stored token (same seat, role and clues) and clears the session only if the room is gone.
4. Send `player:heartbeat` every 5 s while the page is open (`useHeartbeat`). Silent for 15 s = shown as disconnected. If the host is gone 30 s, host passes to a connected player (`room.hostId` changes).
5. `rate_limited` (HTTP 429) means slow down: wait `retryAfterMs` and retry. `cooldown` (also 429) is a game rule: show a countdown from `retryAfterMs`. `server_error` is safe to retry.

## 2. Live state

1. React pages under `src/pages/(app)/`: `useRoomView(code)` returns the public `Room`, pushed live. Works signed out.
2. Other origins (the Netlify game, plain pages): `GET /api/game/room/:code` returns `{ ok, data: { room } }` with `Cache-Control: no-store`, or HTTP 404 `room_not_found`. The game polls every 1 s (500 ms in PUZZLE_2) and keeps only snapshots whose `room.version` is newer than the last one.
3. `room.systems` = `{ breaker, terminal, door }` drives the AR facility (breaker lights, terminal screen, exit door). `room.phase` drives screens. `room.events` (with `seq`) drives toasts and sounds.
4. Private clues are never in `room`. Fetch with `room:me` after the phase leaves READY, when entering INTRO and PUZZLE_2 (new clues are dealt then), and after a reload. Do not show the previous phase's clue while the new one loads.

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

1. `puzzle2:draft { order }` replaces the shared draft (`room.puzzle2.draft`). It is last-writer-wins: fetch the room right before editing (the game does) and expect a rare lost edit when two phones tap within one round trip. `puzzle:submit { puzzle: 2, order }` submits; wrong answers set `retryAfterMs` (3 s, 6 s, 10 s). Hints appear in `room.puzzle2.hints`.
2. `final:press { held: true | false }` on press and release. The door opens when every connected player holds. `room.final.holding` lists who is holding. After `room.final.forceAvailableAt` the host may send `final:force`.
3. Host-only: `game:start`, `intro:skip`, `final:force`, `game:reset` (back to LOBBY for a replay).

## 5. Testing

`node backend/tests/sim/playthrough.mjs [url]` plays a full game with simulated players, including AR-shaped evidence (47 checks). Run it against a local server (`npx deepspace dev start --port 5199`); running it against production creates real rooms, so only do that with approval. The frontend's `tests/live-backend.test.ts` and `e2e/multiplayer.spec.ts` play the same mission through the real web client.
