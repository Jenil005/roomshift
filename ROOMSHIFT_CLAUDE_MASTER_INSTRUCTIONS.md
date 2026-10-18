# ROOMSHIFT — MASTER CLAUDE CODE INSTRUCTIONS

**Project:** RoomShift: Blackout Protocol — SwampHacks XII  
**Repository:** https://github.com/Jenil005/roomshift  
**Base branch:** `main`  
**New integration branch:** `feature/full-integration`  
**Target platform:** iPhone Safari / installable iPhone PWA  
**Frontend deployment:** existing Netlify site `https://remarkable-taffy-417014.netlify.app`  
**Backend deployment:** existing DeepSpace app `https://roomshift.app.space`  
**Primary objective:** ONE polished, playable, multiplayer AR puzzle game—not separate demo sites or duplicate scanners.

> **FOR CLAUDE CODE:** These are implementation instructions, not a request for an architecture-only proposal. Audit the actual checkout, implement changes on the integration branch, validate each milestone, and report evidence. Do not assume the repository is unchanged from the audit notes below.

## 0. HOW TO USE THIS FILE

1. Open the **root** of the `Jenil005/roomshift` repository in VS Code, where `frontend/`, `backend/`, `ar/`, and `shared/` are siblings.
2. Ensure Node.js, npm, Git, and Claude Code are installed. Note that `backend/package.json` requires Node **22.15+** (or a supported newer major) and npm **11.6+**; use a compatible version for all packages.
3. Save **this file** in the repository root as `ROOMSHIFT_CLAUDE_MASTER_INSTRUCTIONS.md`.
4. From the repository root, start Claude Code with `claude`.
5. Tell Claude Code: **“Read `ROOMSHIFT_CLAUDE_MASTER_INSTRUCTIONS.md` in full, inspect the repository, and execute it phase by phase. Begin Phase 0 now. Do not deploy, merge into main, or delete branches without my explicit approval.”**
6. When a phase completes, demand the **actual commands, exit codes, files changed, and remaining issues** before moving on.

**Windows PowerShell note:** if PowerShell blocks npm scripts, use `npm.cmd` instead of `npm` and `npx.cmd` instead of `npx`. On Windows Command Prompt, ordinary `npm` / `npx` also work.

---

## GOAL AND NON-NEGOTIABLE CONSTRAINTS

Build **one canonical player-facing RoomShift PWA**, backed by the existing authoritative DeepSpace multiplayer backend, that includes an immersive world-tracked **Blackout Protocol** research facility and **one** user-facing physical-object scanning experience.

The ideal player journey:

1. Open RoomShift on iPhone via HTTPS, or from the Home Screen icon.
2. Create or join a multiplayer room. Give each player the correct role and private clue.
3. Start a cooperative mission. Enter a **life-sized virtual research facility** anchored in the player's actual space.
4. Use an **integrated** object recognition interaction for BOOK → CUP → KEYS. Prefer MediaPipe when validated, use TensorFlow.js COCO-SSD as an optional compatible detector/fallback, and retain QR/manual paths within the **same scanner UI**.
5. Submit physical evidence to the backend. Only the backend verifies success and advances the mission.
6. Solve the communications-terminal puzzle in the virtual facility, synchronizing across players.
7. Complete the final shared activation and see the facility transition from blackout to restored power, including the exit opening.

**Hard rules:**

- **Do not create two competing object-scanner components or two separate required AR applications.** One coherent player-facing experience; optional internal scanner modes or state transitions are fine.
- **Do not open two camera streams at once.** Niantic XR Engine owns the world-tracked camera while running; reuse a supported camera frame source or implement a deliberate, safe scan ↔ AR state transition with resource cleanup and tracking re-initialization.
- **Do not fake MediaPipe support or KEYS detections.** Standard COCO-style detectors generally support BOOK and CUP but do **not** include KEYS. Support QR for KEYS until a genuinely tested model class exists.
- **Do not trust client-side claims** about game state, identity, puzzle success, positions, timings, or player roles. Retain backend authority.
- **Do not replace the existing backend with a mock.** Keep a separate, visibly labeled local-demo mode if needed.
- **Do not replace a functional part of the game with an untested prototype.** Preserve working fallback behavior.
- **Do not claim it “works perfectly” without measured tests.** Desktop mock tests cannot prove real iPhone tracking, camera behavior, or multiplayer production connectivity.
- **Do not merge into `main`, delete feature branches, deploy over the live site, reveal secrets, or overwrite teammates’ work without explicit approval.** Preview deployments and local tests are preferred.
- Preserve Niantic XR Engine binary and attribution, 3D asset licenses, model licenses, and bundled font licenses. Do not alter or reverse-engineer the engine.

---

## PHASE 0 — BASELINE AUDIT, WORKTREE SAFETY, AND INTEGRATION BRANCH

### Read before editing

- `CLAUDE.md`, `ROOMSHIFT_CONTEXT.md`, `README.md`
- `backend/AGENTS.md`, `backend/CLAUDE.md`
- `backend/.agents/skills/deepspace/SKILL.md` (or equivalent installed DeepSpace skill)
- `docs/game-flow.md`, `docs/game-api.md`, `docs/AR_FRONTEND_INTEGRATION.md`, `docs/AR_UNIFIED_DEPLOY.md`
- `frontend/README.md`, `ar/README.md`, `ar/ROOM_SCALE_AR.md`, `ar/MANUAL_TEST.md`
- Root, `frontend/`, and `backend/` `package.json` files; relevant Vite configs, TypeScript configs, and deployment configs.

### Worktree preparation

Run and inspect:

```bash
git remote -v
git status --short
git branch --show-current
git fetch origin
```

If there are uncommitted files, inspect them and obtain approval before stashing/committing/discarding. From a clean tree, start from the freshest `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/full-integration
```

If the branch already exists, inspect its base and switch to it safely rather than overwriting it.

### Audit the code actually present

Create `docs/INTEGRATION_AUDIT.md`, including an accurate matrix for:

- Frontend routes and phases; backend game phases; shared types and action names.
- Backend HTTP APIs, Durable Objects, security and room-state propagation.
- AR module ownership, camera lifecycle and event formats.
- MediaPipe prototype status vs functional TensorFlow/QR implementation.
- Existing 3D world-tracking engine, asset preparation, runtime paths, placement and licensing.
- PWA caching and Netlify/DeepSpace deployment paths.
- Existing tests, CI status, actual failures, missing assets, known limitations.

**Known issues identified from the current `main` at review time (recheck each):**

1. `frontend/src/game/deepspaceClient.ts` contains an unimplemented `createDeepSpaceClient()` that throws.
2. `frontend/src/screens/Puzzle1.tsx` mounts `CameraView`, whose `frontend/src/game/arBridge.ts` scanner is `null`.
3. Frontend uses legacy mock contracts (`player:ready`, `FINAL_OVERRIDE`, `players[].ready`, `puzzle:submit.result`, etc.) that do not match backend contracts (`room:ready`, `FINAL_SEQUENCE`, `players[].isReady`, `puzzle:submit.submission.physical`, etc.).
4. Frontend mock Puzzle 2/finale mechanics differ from the backend's actual communications boot-order and synchronized activation sequence.
5. `backend/src/pages/(app)/home.tsx` still contains a DeepSpace placeholder page; `backend/src/pages/index.tsx` is also starter-themed.
6. Real iPhone WebAR room is in `ar/public/ar-room.html` + `ar/public/ar-room.js`, separate from the frontend flow.
7. Root-level `MedPipe*.js` and `MedPipeHTML.html` are incomplete standalone proofs of concept; some use undefined variables/functions and unpinned CDN imports.
8. Root Vite builds the AR demo, while `frontend/` builds the real game UI; Netlify must end up publishing the **integrated** frontend with complete AR assets.
9. No passing GitHub CI check was verified for the previous main revision; fresh runs are required.

**Phase 0 exit gate:** Audit documented, integration branch created, no previous work lost, work plan and exact baseline commands recorded.

---

## PHASE 1 — CANONICAL MULTIPLAYER CONTRACTS AND BACKEND ADAPTER

### Source of truth

Use the working backend and shared packages as authoritative:

- `shared/types/index.ts`
- `shared/events/index.ts`
- `shared/constants/index.ts`
- `backend/src/server/game-routes.ts`
- `backend/src/game/engine.ts`
- `backend/src/game/GameRoom.ts`
- `backend/src/game/client.ts`
- `docs/game-api.md`

The real backend supports:

- `POST /api/game` for game commands, room create/join, puzzle submissions and activations.
- `GET /api/game/room/:code` for public room view (particularly useful outside DeepSpace React providers).
- Player-scoped `playerToken` from create/join, private `room:me`, `player:heartbeat`, and session recovery.
- Durable Object per room, server-authoritative phases, puzzle evaluation and state mirrored to DeepSpace records.

### Required work

1. Implement a real `GameClient` / provider for the frontend; replace the stubbed `frontend/src/game/deepspaceClient.ts`.
2. Reconcile `frontend/src/shared/types.ts`, `frontend/src/game/GameClient.ts`, `frontend/src/game/GameProvider.tsx` and all consumers with **canonical shared contracts**. Prefer importing shared types, or a small well-tested transport/view adapter. Avoid shadow type definitions that drift.
3. Use exact authoritative backend transitions:

   `LOBBY → READY → INTRO → PUZZLE_1 → PUZZLE_1_COMPLETE → PUZZLE_2 → PUZZLE_2_COMPLETE → FINAL_SEQUENCE → COMPLETE`

   Treat any local `FAILED`/error/offline display as UI behavior unless explicitly implemented by the real backend. Do not invent server states.
4. Handle real commands including `room:create`, `room:join`, `room:ready`, `game:start`, `intro:skip`, `room:leave`, `room:me`, `player:heartbeat`, `puzzle:submit`, `puzzle2:draft`, `final:press`, `final:force`, `game:reset`.
5. Use the backend's canonical player `isReady`, `hostId`, `systems`, `puzzles`, `puzzle2`, `final`, `events` and per-player private clue data—not mock-only fields such as `power`, `finalCodeAccepted`, `finalHolding` or `puzzle2Scans` as if server-owned.
6. Implement create/join, token storage, reconnect/rejoin with same seat, live public room state and private clue refresh after phase changes. Never broadcast private clues to other players.
7. Support backend `ok:false` errors (`rate_limited`, `cooldown`, `wrong_phase`, etc.) and `ok:true` but `solved:false` puzzle submissions. Show actionable UI errors with retry timing.
8. Keep React `useSyncExternalStore` snapshots referentially stable between real updates; cleanup subscriptions and heartbeat intervals.
9. Determine the supported real-time approach for a Netlify-served frontend. `useRoomView()` runs inside DeepSpace's provider context; do **not** simply import the backend React hook into an unrelated Vite app without proving it works. Use the documented public room view endpoint with bounded polling or a supported authenticated live subscription. Minimize unnecessary traffic.
10. Support configurable API origin, e.g. production `https://roomshift.app.space`, without committing secrets. Confirm real browser CORS, TLS, token and caching behavior. If using a Netlify rewrite/proxy, preserve actual status codes and API JSON responses.
11. Preserve a clearly labeled mock/demo mode for offline design/testing; **production must use the real backend** and cannot silently fall back to bot victories.

### End-to-end success test

Two independent browser contexts or real devices create/join a single backend room, independently ready up, see accurate shared phase/state and their own unique clues, disconnect/reconnect without duplicate identity, and receive proper backend error messages.

**Phase 1 exit gate:** Frontend production mode successfully exercises real backend for lobby, roles and state propagation; checks are recorded. If blocked by deployment/auth, report the blocker, not fake success.

---

## PHASE 2 — REPLACE DUPLICATE SCANNER WITH ONE UNIFIED CAMERA EXPERIENCE

Inspect:

- `frontend/src/screens/Puzzle1.tsx`
- `frontend/src/ui/CameraView.tsx`
- `frontend/src/game/arBridge.ts`
- `ar/PhysicalPuzzle.tsx`, `ar/AiScanner.tsx`, `ar/useAiScanner.ts`
- `ar/detect/`, `ar/scan/`, `ar/physicalOrder.ts`, `ar/types.ts`

### Requirements

1. Keep one user-facing scanner/mode controller embedded into the **actual** `frontend/` mission screen. Prefer extracting/reusing proven `ar/PhysicalPuzzle` functionality, not creating a competing scanner from scratch.
2. Remove `frontend/src/ui/CameraView` from the production Puzzle 1 route and remove/retire its null `orderScanner` seam once no longer used. Do **not** mount two camera owners.
3. Maintain one consistent interface with internal modes: **AI (preferred)**, **QR backup**, and **Manual fallback**. Modes can switch without losing mission state.
4. Preserve `BOOK → CUP → KEYS`, real normalized positions and the existing **1,200 ms stable hold**. Handle slow inference conservatively and reject stale observations.
5. Use actual `PhysicalPuzzleResult` evidence: `source`, `markers[].id`, `markers[].center`, `heldForMs`, and `order` when manual. Adapt the payload to the backend as:

   ```ts
   {
     type: 'puzzle:submit',
     submission: { roomCode: '', playerId: '', puzzle: 1, physical: result }
   }
   ```

   The backend ignores embedded `roomCode`/`playerId` and derives identity from the authenticated session token; it derives camera order from marker centers, ignores client `solved`, and verifies hold duration. Use the current `shared/events` type shape; do not invent new endpoints.
6. A denied camera, model failure, unsupported device, low-confidence detection or lack of KEYS model should display an understandable fallback; do not mark unverified objects as real AI detections.
7. Camera acquisition requires a user gesture on iPhone. Release camera tracks, timers, workers and model resources on completion, mode switch, background, navigation or errors.
8. Ensure consistent ID casing across frontend, AR and backend, and test wrong, missing, duplicate and reversed order cases.
9. Keep scanner overlays legible on small iPhones and ensure no collision with status bar, PWA safe areas or mission controls.

**Phase 2 exit gate:** One production scanner mounted in Puzzle 1; backend accepts real camera-shaped evidence; QR/manual fallbacks behave honestly; no simultaneous duplicate streams.

---

## PHASE 3 — MEDIAPIPE TASKS VISION INTEGRATION

Current `main` has standalone prototype files:

- `MedPipeJS.js`
- `MedPipe-CameraNFrameLoop.js`
- `MedPipe-CrosshairScan.js`
- `MedPipeHTML.html`

These are reference material, **not** a working, bundled production feature. They reference incomplete integration callbacks; CDN URLs are not pinned consistently.

### Implementation

1. Install a **pinned and licensed** version of `@mediapipe/tasks-vision` in the actual frontend package, aligned with its build tooling.
2. Implement a `MediaPipeDetector` conforming to `ar/detect/ObjectDetector.ts` (or reconcile its interface in one shared location). Reuse existing `RawDetection` and `MarkerId` formats where possible.
3. Normalize MediaPipe bounding-box formats correctly. Verify whether reported coordinates are pixel-space vs normalized and handle crop, mirroring, video dimensions, `object-fit`, orientation and device pixel ratio.
4. Prefer local, appropriately cached WASM/model files over unpinned runtime CDN dependencies. Keep model and license/attribution information.
5. Initialize once on demand; warm up if appropriate; use backpressure (no overlapping inference), bounded inference rate and clear resource cleanup.
6. Detector preference: **MediaPipe only when supported and validated**; preserve TensorFlow.js COCO-SSD as a fallback. Do not run both GPU-heavy detectors concurrently by default.
7. Handle model loading failures, unsupported WebGL/WASM, iOS Safari changes, memory pressure, permission denial and frame interruptions without locking the application.
8. Maintain QR detection as a genuine fallback **inside the same unified scanner**.
9. **KEYS warning:** neither standard COCO-SSD nor a default EfficientDet Lite0 COCO-trained model reliably offers a KEYS class. Do not claim otherwise. Use the QR fallback for KEYS until a separately licensed, compatible, actually tested custom model is present. Do not change the puzzle's original object IDs without explicit approval.
10. All detection confidence values must be actual model outputs. Do not use fabricated scores, hardcoded solved responses or fake successful detections in live mode.
11. Test detector-adapter class mapping, bounding-box conversion, noise filtering, staleness, duplicate object handling, fallback transitions and memory/lifecycle behavior.

**Phase 3 exit gate:** One detector abstraction with at least one reliable production model, MediaPipe integrated if technically supported, and accurate reporting of KEYS limitation.

---

## PHASE 4 — INTEGRATE LIFE-SIZED iPHONE WEBAR FACILITY INTO THE GAME

Existing room-scale implementation:

- `ar/public/ar-room.html`
- `ar/public/ar-room.js`
- `ar/public/facility.js`
- `ar/public/room-placement.js`
- `ar/public/room-attribution.html`
- `scripts/prepare-ar.mjs`
- `ar/scripts/check-room-runtime.mjs`

It uses **Niantic XR Engine / 8th Wall SLAM** with Three.js. Its current manual floor calibration is an estimated plane—not a proven real floor-detection capability—and physical iPhone validation remains a separate acceptance step.

### Experience requirements

1. Integrate the AR facility into the canonical frontend's mission progression, with consistent navigation, player session, overlays and shared game context. The player should not need to visit a second, unrelated AR demo website to complete a puzzle.
2. Keep 3D preview clearly labeled **NOT AR** as a fallback. Real AR requires tracked camera motion and scale, not simulated gyroscope look.
3. Implement onboarding: **START AR → grant motion/camera → initialize tracking → calibrate/identify floor using supported mechanisms → visualize room footprint → PLACE ROOM → explore**.
4. Preserve the intended ~**3.4 m × 3.4 m × 2.5 m** research-facility footprint, open entrance, user-controlled placement, tracking loss recovery and calibrated measurement prompts.
5. The facility should stay apparently anchored as the user translates and turns; never label a 3D preview as world-tracked AR.
6. **Single camera authority:** determine whether the licensed XR Engine's supported pipeline provides frames suitable for MediaPipe inference. If so, share those frames without requesting a second camera stream. If not, build an explicit scanner-state transition within the same game: cleanly stop/release tracking, start detector, then resume/relocalize safely with an honest prompt if the placed room must be recalibrated. Document which is used and why.
7. Do not assume Safari immersive `navigator.xr` is available. Use the existing verified engine path rather than switching to unsupported browser APIs.
8. Handle backgrounding, app-switching, pagehide, rotation, viewport size changes, permission changes, camera interruption, WebGL context loss and out-of-memory recoverably.
9. Avoid asynchronous permission calls that lose required user activation; ask for camera/motion directly from an explicit tap as required by iOS Safari.
10. Any bridge between vanilla `ar-room.js` and React must be explicit, typed and lifecycle-safe (component wrapper, custom events or equivalent), not a collection of global anonymous callbacks.
11. Game completion and room power states must not be generated locally simply because a player tapped a 3D control.

**Phase 4 exit gate:** A player opens the facility from the main game, can place and explore it in a candidate WebAR pipeline, then scan objects within one coherent experience. Real device tracking remains pending until tested.

---

## PHASE 5 — MAKE THE FACILITY VISUALLY REALISTIC AND THEMATIC

**Art direction:** **BLACKOUT PROTOCOL** — futuristic research facility during power failure. Aim for a polished, cinematic science-fiction environment suitable for a hackathon demo and convincing in a real room.

### Required artistic elements

- Dark graphite/metal, brushed-steel, concrete and glass physical materials, not only glowing wireframes.
- Blackout-state emergency red lamps, occasional alert pulses, subtle cables, ceiling conduit, industrial panels and ventilation.
- Central power core / breaker with comprehensible animation and power restoration state.
- Research BOOK station; containment CUP station; KEYS/access-control station.
- Multi-panel holo-terminal for the real cooperative communications boot-order puzzle.
- Server racks, screens, status indicators, practical props, emissive strips and spatially coherent layout.
- Non-obstructive floor placement reticle and directional guidance; do not hide real obstacles behind opaque virtual walls.
- Interactive 3D hotspots, readable labels and puzzle progress driven from the live backend state.

### Technical quality constraints

- Use Three.js PBR materials with believable roughness/metalness; tasteful bloom/emissive illusion if affordable; convincing lighting and shadows without heating iPhones.
- Optimize geometry, draw calls, compressed/baked textures, scene assets, shader cost, pixel ratio and garbage generation. Prefer modest glTF/GLB assets where licenses allow, with an inventory and attribution.
- Avoid huge runtime downloads. Measure frame times and total memory where feasible; provide a low-effects mobile mode.
- Stay legible under bright physical lighting and when the real background is visible.
- Do not add heavy visual elements that make room tracking or detection unusable.
- Realism must be assessed on the actual screen/device, not just screenshots of desktop preview.

**Phase 5 exit gate:** Improved believable facility, working interactions, reasonable measured mobile performance, source assets/licensing documented.

---

## PHASE 6 — MAP REAL GAME STATE TO AR WORLD INTERACTIONS

Backend phases:  
`LOBBY → READY → INTRO → PUZZLE_1 → PUZZLE_1_COMPLETE → PUZZLE_2 → PUZZLE_2_COMPLETE → FINAL_SEQUENCE → COMPLETE`

Canonical backend `room.systems`:

```ts
{
  breaker: boolean;
  terminal: boolean;
  door: boolean;
}
```

Map **server-confirmed** events/state to facility visuals:

- `breaker: true` → power core ignites; emergency red fades; facility lighting improves.
- `terminal: true` → research terminal powers up and communications displays activate.
- `door: true` → secured exit unlocks; visible door animation and mission completion.

### Actual game mechanics

**Puzzle 1:** Camera evidence is from the unified scanner; backend checks normalized horizontal centers and hold duration. Wrong arrangements must show a retry without faking success. Manual fallback must be labeled `source:'manual'`.

**Puzzle 2:** Use the backend's real **shared communications boot-order** puzzle; shared draft and private constraints drive terminal interactions. Do **not** retain the mock frontend's incompatible simultaneous-object-scanning mechanic in production.

**Final sequence:** Use backend `final:press`/`final:force`, actual `room.final.holding`, and server phase `FINAL_SEQUENCE`. Do **not** treat the mock final PIN/code flow as the authoritative game.

**Private clues:** Only the current player may see their assigned private clue. Shared facility state can be public, but private information cannot be broadcast through a global 3D scene or a shared event.

**Room updates:** Subscribe to/poll authoritative state efficiently, process event `seq` monotonically to avoid duplicate animations, recover after reload/rejoin, and avoid replaying one-off transitions incorrectly.

**Phase 6 exit gate:** 2+ genuine players watch the virtual laboratory react to the SAME real backend-verified actions and move through the entire server-defined phase sequence.

---

## PHASE 7 — SINGLE CANONICAL PLAYER-FACING PWA AND DEEPSPACE HOME

**Default recommendation:** `frontend/` owns the player-facing UI; `backend/` owns DeepSpace APIs/game authority; `ar/` owns reusable detection, camera and facility modules; `shared/` owns canonical types/events.

Preserve and refactor, rather than discard, the team's existing UI screens:

- `frontend/src/screens/Home.tsx`
- `Lobby.tsx`, `RoleReveal.tsx`, `Puzzle1.tsx`, `Puzzle2.tsx`
- `Transition.tsx`, `FinalOverride.tsx`, `Complete.tsx`, `Failed.tsx`
- `frontend/src/App.tsx` and styles/assets.

### Frontend requirements

- Consistent industrial/Blackout Protocol visual identity and responsive iPhone portrait layout.
- PWA manifest, icons and Home Screen install flow. Respect Safari vs Chromium install differences.
- Proper safe-area insets, text contrast, touch targets, accessible inputs and keyboard behavior.
- Separate and clearly labeled statuses for live multiplayer, offline/demo and reconnecting.
- Manage PWA service worker caching carefully: model assets, lazy chunks and XR engine must not become inconsistent with newly deployed versions. Do not blindly precache the full large ML/SLAM payload on first install.
- Camera/motion activation on explicit taps, and graceful pause/cleanup on pagehide, tab switch, lock screen or scene switch.
- Display meaningful progress during model and XR-engine downloads; show retry/fallback if missing.

### DeepSpace placeholder

`backend/src/pages/(app)/home.tsx` currently serves a starter placeholder, and `backend/src/pages/index.tsx` may still display starter content. Replace with a legitimate RoomShift landing/entry or supported redirect to the **one canonical frontend**. Do not accidentally introduce a second, incompatible full game UI inside backend routes. Do not break `/api/game`, anonymous room-play rules, authentication proxies or Durable Objects.

**Phase 7 exit gate:** One clear player entry URL, real multiplayer screens, integrated AR/game controls, PWA correctness and no misleading DeepSpace placeholder.

---

## PHASE 8 — CONSOLIDATED HTTPS BUILD AND DEPLOYMENT

### Known deployment trap

The repository root and `frontend/` currently contain **different Vite applications**. The root has a working separate AR demo build. The final Netlify site must publish the **real integrated game frontend**, including generated XR engine/Three.js assets, not accidentally publish the old root scanner demo.

### Build objectives

1. Decide on and document a single canonical production build entry point, preferably `frontend/` with scripted copying/bundling of reusable `ar/` assets.
2. Configure `frontend/vite.config.ts` / TS aliases / React dedupe for code imported from `../ar/` and `../shared/`. Avoid duplicate React runtimes / invalid hooks.
3. Copy or bundle versioned ML assets and models, with hashes/license notices. Ensure required MediaPipe WASM and model files are served correctly; retain COCO-SSD model/shards if used.
4. Preserve Niantic binary unmodified. Reuse existing preparation script logic appropriately and retain complete `/external/xr/` and `/external/three/` distributions with licenses.
5. Ensure final built site includes all: app JS/CSS, `/ar` entry if applicable, `.wasm`, worker scripts, Three.js modules, Niantic SLAM chunks/resources, 3D scene assets, model manifests and weight shards, PWA icons/manifest/service worker.
6. Provide a deterministic production verification command validating **final published `frontend/dist/`** (or the explicitly selected canonical directory), not merely the old root `dist/`.
7. Confirm missing `.js`/`.wasm`/model resources return real 404 responses, **not** `index.html` with HTTP 200; verify MIME types and CORS when appropriate.
8. Ensure all camera pages use trusted HTTPS. Protect player tokens and limit API access according to backend rules; no public client-side secrets.
9. Configure frontend to reach DeepSpace API (possibly same-origin rewrite/proxy). Validate that cross-origin browser requests, preflight, JSON error statuses and live updates actually work on deployed iPhone Safari.
10. Update `netlify.toml` for the final game—not just a working legacy AR demo—and document how to deploy **without manual drag-and-drop omissions**.

### Deployment destinations

- **Frontend:** existing Netlify site `https://remarkable-taffy-417014.netlify.app`.
- **Backend:** existing DeepSpace app `https://roomshift.app.space`.

**Do not deploy over either production site without the user's explicit approval.** Prepare and validate locally, deploy Netlify preview when authorized, and ask permission for production backend/site updates. If account/auth access blocks a deploy, produce exact commands and record as BLOCKED; don't claim the deployment succeeded.

**Phase 8 exit gate:** Deterministic build, validated asset manifest, successful browser access to the complete candidate preview, correct backend connectivity, documented production commands.

---

## PHASE 9 — FULL TEST MATRIX (RUN; DO NOT JUST LIST)

### Repo and AR baseline (repository root)

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:ar
npm.cmd run build
npm.cmd run check:room-runtime
```

These current root commands are **baseline checks**. Modify/add final integrated build verification as needed; successful root demo build alone is not the deliverable.

### Frontend

```powershell
cd frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
cd ..
```

### Backend

```powershell
cd backend
npm.cmd ci
npm.cmd run validate
npm.cmd run build
cd ..
```

Follow the actual project scripts and pinned dependency requirements if they change. **Do not skip failing tests or weaken assertions just to make the suite green.**

### Required test classes

**Backend/security:**

- Create/join, unique player tokens, invalid tokens, authorization, host-only actions and private clue isolation.
- Real phase transitions, Puzzle 1 correct/wrong/invalid/manual/hold-duration behavior.
- Puzzle 2 shared draft, hints, answer validation and cooldown.
- Final simultaneous press/force behavior; timer/alarm, reconnect, host handoff, duplicate requests, rate limits.
- Full game simulation via `backend/tests/sim/playthrough.mjs` against the intended running backend (see script usage and API docs); do not run against an unapproved production target.

**Frontend / integration:**

- Real-client adapter request/response mapping, error handling and snapshot stability.
- Correct game screens for **actual** backend phases and data.
- Two independent browsers/devices in one room with consistent public state and separate private clues.
- Rejoin after refresh or network interruption; network recovery without local fake victories.
- Manifest/service worker updates, slow/offline network, route navigation and safe-area layout.

**Computer vision and AR:**

- MediaPipe adapter and fallback selection; actual box mapping/geometry; label IDs and confidence.
- Hold validation, duplicates/missing objects, stale frames and order errors.
- QR fallback and explicit manual evidence; model/WASM load failure and retry.
- Model resource disposal, worker cleanup, single active camera, pause/resume safety.
- XR-engine loading, placement, floor math, tracking feedback, WebGL losses and AR/scan transitions.
- Realistic facility's phase-driven lighting, terminal and exit state; licenses and production asset integrity.

**CI:** Add appropriate GitHub Actions or equivalent automated checks for changed frontend/backend/AR code if permitted; run or report unavailable. No test should require committed secrets.

### Evidence standard

Produce `docs/INTEGRATION_TEST_RESULTS.md` with each command executed, outcome, failure details, browser/device tested, build SHA, run date, asset URLs and remaining risks. Never mark unexecuted tests as PASSED.

**Phase 9 exit gate:** Unit/build/integration checks pass or have explicit blockers; backend and frontend run a genuine full multiplayer mission in at least two contexts where test infrastructure allows.

---

## PHASE 10 — REAL iPHONE ACCEPTANCE TEST (REQUIRES A HUMAN DEVICE)

Create `docs/IPHONE_FINAL_ACCEPTANCE.md` with a checklist and blanks for actual observed results. Claude must not mark the physical tests complete without input from a real iPhone tester.

Test at minimum:

- iPhone model, iOS version, Safari version, HTTPS URL, commit/build revision.
- Open in Safari and installed Home Screen mode.
- Camera/motion permission request, denial and retry.
- AR engine startup, room placement, actual camera translation/parallax and approximate facility scale.
- Measured drift and relocalization; low-light, blank floor and rapid-motion recovery.
- Real BOOK and CUP detector recognition and confidence; KEYS via validated custom model **or** QR fallback.
- Detector overlays/crop alignment and single camera-stream ownership.
- MediaPipe WASM/model and fallback load on real iPhone.
- Gameplay from two separate real iPhones; private clues; Puzzle 1 submit; Puzzle 2 terminal; final multiplayer override.
- World/facility effects strictly follow backend systems `breaker`, `terminal` and `door`.
- Background/resume, screen lock, rotation, returning from another app, network loss, camera privacy indicator turns off on exit.
- Thermals, frame rate/frame-time and memory after several minutes of use.
- Physical walking hazards: virtual walls never imply physical obstacle protection.

Expose a modest, secure debug overlay (disabled in production unless explicitly enabled) showing runtime/model version, tracking status, inference timing, camera state, room version and latest error; never dump private player tokens or raw camera images.

**Phase 10 exit gate:** Real iPhone tester supplies actual observed outcomes; any failure is tracked and retested. Otherwise status must remain **NOT DEVICE-VERIFIED**.

---

## PHASE 11 — DOCUMENTATION, CLEANUP, REVIEW, AND HANDOFF

1. Update `README.md`, `frontend/README.md`, `docs/game-api.md`, `docs/AR_UNIFIED_DEPLOY.md` and relevant AR help files to match **actual implemented** behavior.
2. Consolidate/retire dead scanner UI and obsolete prototype entry points only after proving no production imports depend on them. Keep history, attributions and working fallbacks.
3. Preserve all team-created frontend assets and polish. Do not erase teammates' work without justification.
4. Document the object classes actually supported by the selected model(s), exact KEYS limitation, any manual camera mode transitions, and remaining iPhone compatibility gaps.
5. Add dependency/model/3D-asset license inventory. Keep Niantic XR Engine distribution unchanged and licenses accessible in published builds.
6. Confirm no credentials, private bearer tokens, API keys, `.env`, unrelated secrets, or giant generated vendor files were accidentally committed.
7. Review `git diff --check`, test outputs, final compile and dependency-lock reproducibility.
8. Commit discrete, understandable changes on `feature/full-integration`; push to GitHub only when authorized and prepare a pull request targeting `main` for review.
9. Do **not** delete the old branches or auto-merge PRs.

### Final report format

Return a compact evidence-based report containing:

1. Overall status: **COMPLETE / PARTIAL / BLOCKED**.
2. Branch, commit SHA, GitHub PR link if created.
3. Architecture summary: canonical frontend, backend and unified camera/AR ownership.
4. Major changes by folder/files, including dead scanner removal and DeepSpace placeholder replacement.
5. Real multiplayer integration status, which actions and server phases are verified.
6. MediaPipe version, model, supported classes and fallback behavior. Explicitly state whether KEYS is detected without QR.
7. Room-scale AR status, visual improvements and backend-driven reactions.
8. Exact commands/tests executed and pass/fail counts.
9. Actual deployment status and confirmed URLs. Distinguish preview from production.
10. Real iPhone acceptance result or **NOT DEVICE-VERIFIED**.
11. Open bugs, risks, and prioritized next actions.

---

## PHASE ORDER AND STOP CONDITIONS

**Priority P0:** Phase 0 → Phase 1 (real multiplayer/contracts) → Phase 2 (one scanner) → Phase 4 (AR in the game) → Phase 6 (backend-driven mission) → Phase 8 (build correctness) → Phase 9 (real tests).

**Priority P1:** Phase 3 (MediaPipe adapter), Phase 5 (scene realism), Phase 7 (PWA/DeepSpace entry), Phase 10 (iPhone physical testing), Phase 11 (polish/documentation). These may be iterated earlier where they unblock P0, but must never mask a broken real game loop.

After each major phase, **run available verification and provide a short milestone update with evidence**. Continue implementation where possible; if blocked by credentials, third-party limitations, or physical-device requirements, finish independent tasks and explicitly list the required user action.

### Definition of done

This project is **not finished** simply because separate Netlify and DeepSpace URLs load. It is finished only when:

- Two real players join a single server-backed session.
- They have distinct private information and share only permitted public state.
- A **single** integrated scanner uses genuine object evidence and QR/manual fallbacks honestly.
- The same game contains the themed world-tracked facility, without duplicate camera ownership.
- The real backend verifies all three gameplay stages and synchronizes changes across devices.
- The facility's breaker, terminal and exit effects reflect server state.
- Final integrated PWA is built with all required assets and accessed successfully over HTTPS.
- All feasible tests pass and true iPhone-specific behavior is verified by a human device test; otherwise call out the remaining acceptance gap precisely.

**Start Phase 0 now. Inspect before editing; then implement instead of merely planning.**
