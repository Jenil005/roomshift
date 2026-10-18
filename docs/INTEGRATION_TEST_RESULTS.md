# RoomShift integration test results (Phase 9)

- **Run date:** 2026-10-17 to 2026-10-18 (UTC)
- **Branch:** `feature/full-integration`, local only (not pushed)
- **Builds tested:** checks below ran at `7fa1e30` (root/AR), `ea2df8d` (frontend unit + browser E2E, backend), `945b8da` (AR browser suite)
- **Machine:** Windows 10, i7-6500U, 12 GB RAM, Intel HD 520. Node v24.22.0, npm 11.19.1, Playwright 1.64.1 with Chromium (headless, SwiftShader software WebGL)
- **Backend under test:** a **local** DeepSpace dev server (`npx deepspace dev start --port 5199`, miniflare). The production backend `https://roomshift.app.space` received only read-only requests (see section 6).
- **Status legend:** PASS = executed and passed · FAIL = executed and failed · NOT RUN = not executed (reason given). Nothing here was marked PASS without running.

## 1. Summary

| Area | Result |
|---|---|
| Root / AR unit and build checks | PASS (79 tests; build; room runtime verified) |
| Frontend lint, unit tests, build, published-`dist` verification | PASS (18 tests + 1 opt-in; 102 dist checks) |
| Frontend ↔ real backend, two HTTP clients, full mission | PASS |
| Two browsers, full live mission (real COCO-SSD + QR evidence, server verification, shared terminal, joint hold, reset) | PASS |
| Facility (XR8 contract double): placement, scanner hand-off, server-driven state, 3D tap edits | PASS (load flake once, see 5) |
| Real detector models on CC0 photos (MediaPipe + COCO-SSD) | PASS |
| Backend lint, typecheck + unit tests, build, 47-step multiplayer simulation | PASS (63 tests; 47/47) |
| AR team browser suite (`ar/tests/browser`) | 25 of 30 PASS; 5 FAIL, pre-existing timing failures in the legacy room view (section 5) |
| GitHub CI | NOT RUN (workflow added, not pushed) |
| Netlify preview / production | NOT RUN (awaiting approval) |
| Real iPhone | NOT RUN, **NOT DEVICE-VERIFIED** (docs/IPHONE_FINAL_ACCEPTANCE.md) |

## 2. Repository root (AR module)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | |
| `npm test` (vitest, `ar/tests/**`) | 0 | 7 files, 79 tests passed |
| `npm run test:ar` (node --test) | 0 | 3 passed, 0 failed |
| `npm run build` (tsc over `ar/` + legacy demo build) | 0 | built (after fix `7fa1e30`, below) |
| `npm run check:room-runtime` | 0 | 13 XR Engine artifacts, licenses and Three.js copies verified byte-for-byte |

Found by this run and fixed: `npm run build` failed (exit 2) because the root `tsc` now also sees the MediaPipe adapter and a placement test importing the legacy JS module. Fixed in `7fa1e30` (root pin of `@mediapipe/tasks-vision` 1.0.1, `room-placement.d.ts`); CI now runs this build (`cadab60`).

## 3. Frontend (`frontend/`, the canonical game)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | |
| `npm run lint` | 0 | no problems |
| `npm test` | 0 | 2 files, 18 passed, 1 skipped (the live-backend test needs `ROOMSHIFT_API`) |
| `npm run build` | 0 | |
| `npm run verify:dist` | 0 | 102 checks passed (XR Engine 1.0.0 unmodified, MediaPipe WASM unmodified, every model shard, PWA files, credits, no demo engine or puzzle answers) |
| `ROOMSHIFT_API=http://127.0.0.1:5199 npx vitest run tests/live-backend.test.ts` | 0 | 1 passed: two independent HTTP clients play lobby → COMPLETE with polling, private clues, same-seat rejoin, a real `not_host` error, wrong then right camera evidence, the shared boot draft and a joint hold |

Unit tests (`src/game/client.test.ts`, `tests/selectDetector.test.ts`) run the client against the **real backend engine** and cover: create/join and token storage, `isReady`/server phases, private clue isolation (no clue text in the public view), snapshot stability, ignoring older room versions, same-seat rejoin after reload, `not_host`/`cooldown` errors with retry time, `solved:false` submissions, reconnecting → offline, room closed, a full mission, client identity fields being ignored, **no previous-phase clue shown when new clues are dealt**, and detector selection/fallback/thresholds.

Found by this run and fixed: on entering PUZZLE_2 the screen briefly showed the puzzle 1 clue as the new notes until `room:me` answered. Fixed in `ea2df8d`; its regression test was shown to fail without the fix and pass with it.

### Browser E2E (Playwright, production build on `127.0.0.1:4173`, API on a different origin `127.0.0.1:5199`, 390×844 viewport, one file at a time)

| Spec | Exit | Time | What it proves |
|---|---|---|---|
| `e2e/multiplayer.spec.ts` | 0 | 57 s | Two browser contexts, one live room: cross-origin API, polling, distinct private clues never shown to the other player, reload keeps seat and clue, host-only controls, **server rejects a wrong manual report**, **real COCO-SSD sees the book and cup in camera frames from CC0 photos while the QR decoder reads the KEYS tag, the server verifies the evidence**, camera tracks released, the shared boot order built from both phones, both holding → POWER RESTORED on both, host reset → lobby on both |
| `e2e/facility.spec.ts` | 0 | 53 s | Facility opens as "3D PREVIEW · NOT AR"; START AR → calibrate → place with the XR8 **contract double**; SCAN OBJECTS stops XR8 and releases its camera before the scanner mounts (scanner opens no camera before a tap); second XR8 run; another player's server-verified breaker appears in the AR HUD without moving the placed room; a real raycast tap on a 3D terminal panel becomes a `puzzle2:draft` both phones see; leaving releases the camera again |
| `e2e/detectors.spec.ts` | 0 | 39 s | Real models on CC0 photos: MediaPipe EfficientDet-Lite0 book 0.424 / cup 0.788 (≈2.3 s/frame), COCO-SSD book 0.671 / cup 0.963 (≈1.5 s/frame, software WebGL); boxes in input pixels within the frame; both detectors place each object at the same normalized position (< 0.12); neither reports a keys class |
| `DETECTOR=mediapipe e2e/multiplayer.spec.ts` (phase 3 worktree) | 1 | | **FAIL, recorded finding**: with MediaPipe selected the scan never verified. MediaPipe found only the KEYS QR tag (neither book nor cup) in the composite frame, and frames came >2.5 s apart. COCO-SSD therefore stays the default; MediaPipe is opt-in (`?detector=mediapipe|auto`) |

## 4. Backend (`backend/`)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | (a first attempt failed while the local dev server held the files; it was stopped and the install repeated cleanly) |
| `npm run lint` | 0 | |
| `npm run validate` (tsc + vitest) | 0 | 5 files, 63 tests passed (engine, puzzle 1, rate limit, Gemini fallback, prerendered landing) |
| `npm run build` | 0 | |
| `node tests/sim/playthrough.mjs http://127.0.0.1:5199` | 0 | 47 PASS, 0 FAIL: create/join, tokens never in views, invalid tokens, host-only actions, private clue isolation, AR camera evidence → breaker, wrong boot order → 3 s cooldown and 429 during cooldown, hints, pooled clues give exactly one order, early force → cooldown, one hold not enough, door + `game:complete`, narration fallbacks, reset, per-player rate limit not affecting others, room_full, deleted room |

## 5. AR team browser suite (`ar/tests/browser`, root dev server, one file at a time)

| Spec | Before this work (baseline) | Now | Notes |
|---|---|---|---|
| `ai.spec.ts` | 7/7 | 7/7 PASS | |
| `puzzle.spec.ts` | 7/7 | 7/7 PASS | Includes the `PhysicalPuzzle` change (server-judged manual reports are opt-in; demo behaviour unchanged) |
| `room.spec.ts` | 4/10 | **10/10 PASS** | Root cause of the 6 baseline failures: current Chromium exposes the iOS-style motion permission API and answers "denied" without a grant. The harness now grants sensors (`945b8da`); the explicit denial tests keep their own mocks |
| `phone.spec.ts` | 2/6 | 1/6, **5 FAIL** | Legacy `ar/index.html?room` view (not used by the game). Failures are timing assertions under software WebGL on this laptop: >5 animation frames per 500 ms expected, 2 to 5 measured; one 30 s page timeout. `phone.spec.ts:40` passed when run alone earlier. Thresholds were not loosened |

Flakes observed on this machine (CPU-bound software WebGL): `e2e/facility.spec.ts` failed once with the client showing RECONNECTING and calibration not offered within 10 s, then passed on rerun (4 of 5 runs of the finished test passed); `e2e/multiplayer.spec.ts` once failed a camera-release check that was then changed to poll.

## 6. Production endpoints (read-only)

| Request | Result |
|---|---|
| `GET https://roomshift.app.space/api/game/room/ZZZZ` with Netlify `Origin` | HTTP 404 JSON `room_not_found`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store` |
| `OPTIONS https://roomshift.app.space/api/game` (preflight, `POST`, `content-type`) | HTTP 204, origin `*`, `content-type` allowed, `POST` allowed |

The production backend was **not** sent any game request, and its deployed version was not compared with this branch (the backend changes here are the landing page only; the game API is unchanged).

## 7. Not run, and why

| Item | Reason | Needed |
|---|---|---|
| GitHub Actions CI (`.github/workflows/ci.yml`) | branch not pushed | approval to push |
| Netlify deploy preview, live 404/MIME/CORS checks on the published site | no deploy authorised | approval + Netlify login or Git-connected site |
| Simulation against production | could create rooms on the live backend | explicit approval |
| Backend Playwright suites (`deepspace test run`) | template smoke/API/collab suites need the DeepSpace test runner and login session; covered here by `validate` (incl. prerender) and the simulation | optional |
| Real iPhone: tracking, scale, drift, camera, detection accuracy, thermals, two-phone play | requires people and devices | docs/IPHONE_FINAL_ACCEPTANCE.md |

## 8. Remaining risks

1. **No device verification.** World tracking, floor calibration accuracy, XR8 restart in the same page, camera hand-off timing, model speed and thermals are unproven on iPhone. Desktop runs use the XR8 contract double.
2. **Boot-order draft is last-writer-wins.** The client edits from a fresh server copy and polls at 500 ms in PUZZLE_2, but two phones tapping within one round trip can still overwrite each other. A server-side add/remove operation would close it (backend change, not made).
3. **Polling, not push.** The Netlify app polls `GET /api/game/room/:code` once a second (500 ms in PUZZLE_2) plus a 5 s heartbeat. Fine for 2 to 4 phones per room; venue-wide load is untested.
4. **MediaPipe** is integrated but weaker than COCO-SSD on our scenes and slow in software WebGL; it stays opt-in.
5. **KEYS** has no detector class in either model. KEYS is identified only by its printed QR tag.
6. **Floor height** is a manual estimate from the typed camera height, not plane detection.
7. **Legacy pages** (`ar-room.html`, root AR demo) still build at the root but are no longer published by Netlify.
