# RoomShift integration audit (Phase 0)

- Date: 2026-10-17
- Branch: `feature/full-integration`, created earlier from `main` and still identical to `origin/main` at `8a7ce3b` (checked after `git fetch origin`)
- Working tree: clean apart from the untracked `ROOMSHIFT_CLAUDE_MASTER_INSTRUCTIONS.md`. No uncommitted work was stashed or discarded.
- Toolchain: Node v24.22.0, npm 11.19.1 (meets backend `>=24 <25`, npm `>=11.6`). Git Bash on Windows 10.

## 1. Baseline commands (before any change)

| Command | Dir | Exit | Result |
|---|---|---|---|
| `npm ci` | root | 0 | installed |
| `npm ci` | frontend | 0 | 0 vulnerabilities |
| `npm ci` | backend | 0 | audit warnings (pre-existing) |
| `npm test` (vitest) | root | 0 | 6 files, 75 tests passed (AR unit tests) |
| `npm run test:ar` (node --test) | root | 0 | 3 passed |
| `npm run build` | root | 0 | builds the **AR demo** (`ar/demo`) into `dist/` (59 MB incl. 40 MB XR engine + Three.js) |
| `npm run check:room-runtime` | root | 0 | 13 engine artifacts verified byte-for-byte |
| `npm run lint` | frontend | **1** | 4 errors: `App.tsx:76` setState in effect, `GameProvider.tsx:17,23` react-refresh exports, `CameraView.tsx:10` ref read during render |
| `npm run build` | frontend | 0 | builds mock-only game UI |
| `npm run validate` | backend | 0 | tsc + 5 files, 63 tests passed |
| `npm run build` | backend | 0 | |
| `npm run lint` | backend | 0 | |
| `npx deepspace dev start --port 5199` + `node tests/sim/playthrough.mjs http://127.0.0.1:5199` | backend | 0 | local miniflare backend; full simulated playthrough ALL PASSED (puzzle 1 camera evidence, puzzle 2 cooldown/hints, final hold/force, reset, rate limit, room_full) |
| `gh run list` | - | 0 | no workflow runs; repository has no `.github/workflows` (no CI) |
| `curl https://roomshift.app.space/api/game/room/ZZZZ` (read-only) | - | - | HTTP 404 JSON `room_not_found`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store` |

## 2. Phase / contract matrix

| Concern | Backend + `shared/` (authoritative) | `frontend/` on main | Gap |
|---|---|---|---|
| Phases | `LOBBY READY INTRO PUZZLE_1 PUZZLE_1_COMPLETE PUZZLE_2 PUZZLE_2_COMPLETE FINAL_SEQUENCE COMPLETE` | adds `FINAL_OVERRIDE`, `FAILED` | frontend invents 2 states |
| Types | `shared/types` `Room`, `Player.isReady`, `systems`, `puzzles`, `puzzle2`, `final`, `events[seq]` | own `frontend/src/shared/types.ts` (`ready`, `power`, `deadline`, `puzzle2Scans`, `finalCodeAccepted`, `finalHolding`, `lastError`) | shadow contract; nothing shared |
| Ids | objects `book/cup/keys` (server is case-insensitive), roles `engineer/analyst/operator/scout` | `BOOK/CUP/KEYS`, `ARCHIVIST/COURIER/TIMEKEEPER` | mismatch |
| Actions | `room:create {playerName}`, `room:join {code, playerName, playerToken?}`, `room:ready`, `game:start`, `intro:skip`, `room:leave`, `room:me`, `player:heartbeat`, `puzzle:submit {submission}`, `puzzle2:draft`, `final:press`, `final:force`, `game:reset` | `room:create {name}`, `player:ready`, `intro:ack`, `puzzle:submit {result}` / `{target}`, `final:code`, `final:activate` | 6 actions do not exist on the server |
| Puzzle 2 | Comms Boot order (`shared/puzzles/commsBoot.ts`): shared draft, private constraints, hints, cooldowns 3/6/10 s | simultaneous object scan within 5 s | different game |
| Final | every connected player holds (`final:press`), 1.5 s grace, host `final:force` after 30 s | 3-digit PIN + hold | different game |
| Private clues | `room:me` returns only the caller's lines | computed locally from role | |
| Timer | none server-side (no deadline, no FAILED) | 8 min life bar, FAILED | UI-only concept |

## 3. Backend

- HTTP: `POST /api/game` (zod-validated, 4 KB cap, per-IP limit 120 burst / 30 per s, create limit), `GET /api/game/room/:code` (public view, `no-store`). Status codes map from `GameErrorCode` (`cooldown`/`rate_limited` 429, `not_in_room` 401, ...).
- CORS: `app.use('/api/*', cors())` in `backend/worker.ts`, so any origin can call the API. Tokens travel in the JSON body, not cookies.
- Identity: random `playerToken` minted on create/join; only its SHA-256 reaches the Durable Object. Rejoin with the old token keeps the seat.
- `GameRoom` Durable Object per code: commands serialized with `blockConcurrencyWhile`, timers via DO alarm, state mirrored to the DeepSpace `rs_rooms` record (`useRoomView` in DeepSpace React pages; anonymous socket in `tests/sim`).
- Rate limits inside the room: 20 burst / 5 per s per player; unauthenticated traffic (joins, view polls) 40 burst / 10 per s per room per command type.
- Engine (`backend/src/game/engine.ts`) is pure and synchronous: `reduce(state, command, {now, random})`.
- Puzzle 1 (`puzzle1.ts`): camera evidence re-ordered from `markers[].center.x`, coordinates must be within [-0.05, 1.05], `heldForMs >= 1200`, client `solved`/`order` ignored for camera; manual uses `order`. Wrong attempt: `ok:true solved:false` plus 1 s cooldown.
- Pages: `src/pages/index.tsx` and `src/pages/(app)/home.tsx` are DeepSpace starter placeholders.
- Local run: `npx deepspace dev start` works (CLI session present), giving a local miniflare backend for tests without touching production.

## 4. AR module (`ar/`)

| Piece | Status |
|---|---|
| `PhysicalPuzzle.tsx` | Working unified scanner with modes AI / QR backup / Manual. Emits `PhysicalPuzzleResult` (`source`, `markers[].center`, `heldForMs`, `order`). Manual mode checks the answer **client-side** before emitting. |
| `AiScanner.tsx`, `useAiScanner.ts`, `detect/AiScanSession.ts` | COCO-SSD lite_mobilenet_v2 (self-hosted under `ar/public/models/coco-ssd`, Apache-2.0), max ~4 inferences/s, no overlap, QR worker for KEYS in the same frame, releases camera on stop/hidden. |
| `detect/ObjectDetector.ts` | Detector interface (`name`, `classMap`, `detect(canvas)`); pixel boxes. |
| `physicalOrder.ts` | `PhysicalOrderTracker`, 1200 ms hold, drift/gap/row checks. |
| `scan/*` | jsQR decoding in a worker, tag payload `roomshift:v1:<id>`. |
| `room/RoomScene.ts`, `sync/*` | Older non-tracked 3D room with local sync; not used by the WebAR page. |
| `public/ar-room.html` + `ar-room.js` + `facility.js` + `room-placement.js` | Standalone Niantic XR Engine (8th Wall, `@8thwall/engine-binary@1.0.0`) + Three 0.183.2 world-tracked 3.4 x 3.4 x 2.5 m facility. Manual floor calibration from a typed camera height (not plane detection). Power toggle is **local only**. Not connected to the game. Requires reload to restart AR. |
| `public/room/*.js` | A second copy of facility/placement/engine loader; only `tests/room-placement.test.js` imports `room/placement.js`. |
| Root-level `MedPipe*.js`, `MedPipeHTML.html` | Standalone MediaPipe prototypes: unpinned `@latest` CDN imports, model fetched from Google storage, undefined integration callbacks. Not bundled anywhere. |
| Root-level `*.cs`, `Puzzle1JS.js`, `CompactPuzzle1JS.js` | Unity/C# and JS prototypes; not imported by any build. |
| KEYS | No detector in the repo has a keys class. KEYS is QR-only today. |

Camera ownership: `frontend/src/ui/CameraView.tsx` opens its own `getUserMedia` stream and calls a `null` `orderScanner` (`frontend/src/game/arBridge.ts`), so it never produces evidence. The AR scanner and the XR engine live in different apps, so they never run together today.

## 5. Build and deploy

- Root Vite app = AR demo (`index.html` -> `ar/demo/main.tsx`, `publicDir: ar/public`). `netlify.toml` builds and publishes this root `dist/`. So the Netlify site serves the AR demo, **not** the game UI.
- `frontend/` = game UI on a mock client (`VITE_GAME_CLIENT` unset -> mock; `deepspace` -> throws).
- `scripts/prepare-ar.mjs` copies the unmodified XR engine, Three.js build + OrbitControls and licenses into the git-ignored `ar/public/external/`, and writes `runtime-manifest.json` with SHA-256s.
- PWA: `frontend/public/sw.js` precaches the shell and `/assets/*`, network-first navigation, ignores cross-origin requests. Manifest and icons exist.

## 6. Known issues from the instructions, rechecked

| # | Claim | Confirmed |
|---|---|---|
| 1 | `createDeepSpaceClient()` throws | yes |
| 2 | Puzzle1 mounts `CameraView` with a null scanner | yes |
| 3 | legacy action/field names | yes (section 2) |
| 4 | mock Puzzle 2 / finale differ from backend | yes |
| 5 | DeepSpace placeholder pages | yes |
| 6 | WebAR room separate from the game | yes |
| 7 | MediaPipe files are incomplete, unpinned prototypes | yes |
| 8 | root builds AR demo, frontend builds game; Netlify publishes root | yes |
| 9 | no passing CI | yes, no CI exists |

Extra findings: frontend lint fails on main (4 errors); duplicate `ar/public/room/*` copies; `ManualOrder` reveals and checks the solution in the client.

## 7. Work plan

1. Phase 1: frontend imports `shared/` through an `@shared` alias; new `GameClient` snapshot built on the canonical `Room`; real HTTP client (`POST /api/game`, polling `GET /api/game/room/:code` about once a second while visible, heartbeat every 5 s, `room:me` after phase changes, version-monotonic snapshots, token in localStorage, rejoin on load). Mock mode runs the **real backend engine** in the browser with labeled bots. Screens rewritten for real phases and mechanics.
2. Phase 2: Puzzle 1 mounts `ar/PhysicalPuzzle` (one camera owner); `CameraView` and `arBridge` retired; manual answers judged by the server.
3. Phase 4/5/6: port `ar-room.js` into a typed, lifecycle-safe TS module bundled by the frontend (same Three instance as XR8), with an explicit AR <-> scanner camera handoff; facility visuals driven by `room.systems` and live puzzle 2 / final state.
4. Phase 3: pinned `@mediapipe/tasks-vision` detector behind `ObjectDetector`, local WASM + model, COCO-SSD fallback.
5. Phase 7/8: canonical build is `frontend/`; asset preparation script; dist verifier; Netlify config publishes `frontend/dist`; DeepSpace landing points to the frontend.
6. Phase 9-11: tests (unit, local two-context multiplayer run against the local backend), CI workflow, result docs, iPhone checklist.
