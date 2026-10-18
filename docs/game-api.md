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

## 3. Puzzle 1: scan BOOK, CUP, KEYBOARD one at a time, in sequence

1. Each newly recognized object is one request, sent as soon as it is recognized:
   ```ts
   gameRequest({ type: 'puzzle1:scan', scan: { object: 'book', source: 'ai', confidence: 0.67 } }, session)
   ```
   `source` is `'ai'` (with the detector's score, 0..1) or `'qr'` (a printed tag). The game client queues these (`client.scanObject`), sends them in order, and retries after a network error.
2. Progress is the team's and lives on the server: `room.puzzle1.scanned` lists accepted scans in order (`{ object, source, by, at }`). It survives reloads, reconnects and switching between the scanner and the facility.
3. Every valid scan returns `ok: true, data: ScanData` with `status`:
   - `accepted`: the next object of the sequence, appended;
   - `duplicate`: already scanned; nothing changes (a retried request is safe);
   - `rejected`: out of sequence. Counted as a failed attempt: progress is cleared and `retryAfterMs: 1000` applies; scans during that second get `cooldown`;
   - `solved`: the last object completed the sequence; the breaker is online and the phase moves to PUZZLE_1_COMPLETE.
4. Refused without counting (`bad_request`): unknown object ids, and AI scans with no score or a score below `PUZZLE1_SCAN_MIN_CONFIDENCE` (0.35, a sanity floor; the phone's own per-detector bars are stricter). The server cannot check that a camera really saw the object: a scan is gameplay input, not proof.
5. `puzzle1:restart` clears the team's progress (not a failed attempt). `game:reset` clears it too.
6. Manual fallback: `puzzle:submit { puzzle: 1, physical: { source: 'manual', order } }` or `manualCode: 'BCK'`, recorded as `room.puzzles[1].verifiedBy = 'manual'`. Scans are recorded as `'camera'`. The old simultaneous-arrangement evidence (`markers`, `heldForMs`) and the `scanned` list are no longer accepted.

## 4. Puzzle 2 and finale

1. `puzzle2:draft { order }` replaces the shared draft (`room.puzzle2.draft`). It is last-writer-wins: fetch the room right before editing (the game does) and expect a rare lost edit when two phones tap within one round trip. `puzzle:submit { puzzle: 2, order }` submits; wrong answers set `retryAfterMs` (3 s, 6 s, 10 s). Hints appear in `room.puzzle2.hints`.
2. `final:press { held: true | false }` on press and release. The door opens when every connected player holds. `room.final.holding` lists who is holding. After `room.final.forceAvailableAt` the host may send `final:force`.
3. Host-only: `game:start`, `intro:skip`, `final:force`, `game:reset` (back to LOBBY for a replay).

## 5. Testing

`node backend/tests/sim/playthrough.mjs [url]` plays a full game with simulated players, including AR-shaped evidence (47 checks). Run it against a local server (`npx deepspace dev start --port 5199`); running it against production creates real rooms, so only do that with approval. The frontend's `tests/live-backend.test.ts` and `e2e/multiplayer.spec.ts` play the same mission through the real web client.
