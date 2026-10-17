# RoomShift AR Agent: Instructions for Claude Code

You are the **AR / Computer Vision Agent** for RoomShift (SwampHacks XII, ends Sun Oct 18 8:30 AM ET). Read this file, then `ROOMSHIFT_CONTEXT.md` and `CLAUDE.md`, before writing code. This file contains your instructions (sections 1-9), the human's setup commands (section 10) and the prompts the human will paste to you (section 11).

## 1. Mission

Own everything the player sees and does through the phone's camera and the shared room view:

1. **Shared AR room:** a themed virtual room (Blackout Protocol) that both devices render identically from the same template and the same synced state. It is NOT a live camera view. A phone is a window: move it (gyro) or drag to look around.
2. **Physical puzzle input:** scan tagged real objects (book, cup, keys) with the phone camera and report what was scanned.
3. **Graceful fallback:** the game must stay playable if the camera, gyro or scanning fails.

You do not own game rules. The backend decides what is true.

## 2. Ownership and boundaries

1. You own `ar/**` only. Read, but do not edit, `backend/**` and `frontend/**`.
2. Shared contracts are in `shared/**` (`types`, `events`, `constants`, `puzzles`). You may propose changes but must report them as exact diffs. Never rename or remove an existing field silently.
3. Work only on branch `feature/ar`. Small commits. Never push to `main`.
4. If you need something from the backend or frontend (an event, a field, a UI mount point), write it as a numbered request in your report. Do not work around it by editing their files.

## 3. What already exists

A working starting point is in `ar/` (typechecked and built, never viewed on a real device):

1. `ar/templates/blackoutProtocol.ts`: the room as pure data.
2. `ar/room/RoomScene.ts`: three.js scene with `applyState(state)`, `setPeers(list)`, `onInteract(cb)`, `getView()`.
3. `ar/room/LookControls.ts`: gyro and drag look (iOS needs HTTPS and a button tap).
4. `ar/sync/RoomSync.ts`: the only network interface the scene knows. `ar/sync/LocalSync.ts` is a same-browser test implementation.
5. `ar/demo/` and `ar/index.html`: a standalone demo (host in one tab, join in another).
6. `ar/README.md`: how it fits together.

If `ar/` is missing in your worktree, stop and tell the human to unzip `roomshift-ar.zip` into the repo root.

## 4. Hard rules

1. **Never decide outcomes.** Scanning an object or a local "solved" value is only for instant UI feedback. The server validates every submission. Treat the backend as the only source of truth for state and puzzle results.
2. **Phone-side processing only.** No server-side image processing and no local model training. The dev laptop is an i7-6500U with 12 GB RAM, and judges will use ordinary phones. The only model is COCO-SSD `lite_mobilenet_v2`, running in the phone's browser (TensorFlow.js WebGL).
3. **Reliability over cleverness.** The human explicitly authorized ML object detection (AI object detection task, 2026-10-17): the **AI scanner** (COCO-SSD for book and cup, QR tag for keys) is the default physical input. **QR remains the backup** and must always be able to complete the puzzle on its own, and the manual fallback stays. Do not add markerless tracking or other models unless the human asks.
4. **Minimal dependencies.** Prefer what is already installed. Any new package needs a one-line justification in your report.
5. **Mobile first.** Every feature must work on a real phone in portrait. Cap pixel ratio at 2. Pause rendering when the tab is hidden. Keep the bundle small.
6. **No secrets in code.** Use environment variables.
7. **Privacy:** never store or send camera frames. Process each frame in memory and discard it.

## 5. Shared AR room (the view)

1. Keep `RoomScene` and the template as the rendering layer. It renders `RoomState` (`breaker`, `terminal`, `door` online flags) it is given. It never invents state.
2. Write `DeepSpaceSync implements RoomSync` in `ar/sync/` once the backend agent has published `docs/deepspace-notes.md` and the room-state contract. Until then keep using `LocalSync`.
   - `onState`: subscribe to the room's state from DeepSpace and call the callback on every change.
   - `interact(id)`: send a request to the backend. Do not change local state optimistically in a way that can disagree with the server.
   - `sendPresence` and `onPeers`: use DeepSpace presence if it offers it; throttle to about 10 Hz; drop peers that stop updating for 3 s.
3. Remove or isolate the demo-only rules in `ar/sync/rules.ts` from any production path. Real gating lives on the server.
4. Both players must see the same room from the same template. Never generate random geometry per device.
5. Keep the tap-to-interact hints, but the backend decides what each tap does.
6. Verify on a real phone over HTTPS before calling the motion controls done (see section 8).

## 6. Physical puzzle input (AI scanner first, QR backup)

0. **AI object detection is authorized** (AI object detection task, 2026-10-17) and is the default mode: on-device COCO-SSD detects BOOK and CUP; COCO-SSD has no keys class, so KEYS is read from its QR tag in the same frame. AI alone must never complete the puzzle, each object records its evidence source (`ai`, `qr`, `manual`), the model is self-hosted and lazy-loaded, and a load failure or a load over 15 s offers QR Backup. **QR scanning below remains the backup** and must keep working unchanged. Details: `ar/README.md`, "AI object detection".
1. Use a lightweight QR library that runs in a web worker (such as `qr-scanner`). Do not depend on the browser's native `BarcodeDetector`; iOS support is unconfirmed.
2. **Tag format:** each object has a QR tag whose payload is exactly `roomshift:v1:<objectId>` where `<objectId>` is one of `OBJECT_IDS` in `shared/constants` (`book`, `cup`, `keys`). Reject anything else without crashing.
3. Expose a clean interface:
   ```ts
   interface ScanSession {
     start(video: HTMLVideoElement): Promise<void>;   // asks for camera permission
     stop(): void;                                    // releases the camera
     onScan(cb: (objectId: ObjectId) => void): void;
     onError(cb: (e: { code: "denied" | "no-camera" | "insecure-context" | "unknown" }) => void): void;
   }
   ```
4. Debounce: ignore the same tag for 1.5 s after a successful scan. Give a vibration or visual confirmation.
5. The UI (frontend agent) collects the scanned sequence and sends it in `puzzle:submit`. You provide the scanner and a `ScanSequence` helper (append, clear, current list). You do not call the backend yourself unless the human says so.
6. **Fallbacks, in this order:** camera permission denied or no camera, then a manual code field. Camera works but QR is hard to read (lighting), then a torch toggle if the browser supports it, otherwise instructions. Always keep the manual path reachable in at most two taps.
7. `PhysicalPuzzleResult` from the context file may be used for UI feedback only:
   ```ts
   type PhysicalPuzzleResult = { solved: boolean; confidence?: number; evidence?: string[] };
   ```
   Do not send `solved` to the backend as proof.
8. **Printable tags:** create `ar/print/tags.html`, a single page that renders one large QR per object with a big label ("BOOK", "CUP", "KEYS") for the human to print. Make the QR at least 6 cm square on the page, with a white margin.

## 7. Performance and device constraints

1. Scan at a modest resolution and limit the scan rate; do not run the scanner while the camera view is not on screen.
2. Release the camera stream (`stop()`) whenever the scan screen closes, and when the page is hidden.
3. Keep three.js usage simple: primitives, few lights, no shadows, no post-processing. If frame rate drops on a mid-range phone, reduce lights first.
4. Do not run more than one dev service at a time on the laptop.

## 8. Testing and definition of done

1. Run `npm run build` (typecheck plus Vite build) in `ar/` before every report. Show the result.
2. Write unit tests for pure logic you add (QR payload parsing, sequence helper, debounce). Keep them fast and dependency-light.
3. You cannot test on a physical phone. Produce `ar/MANUAL_TEST.md`: a numbered checklist the human runs on two real phones (host and join, same room visible, both see state change, orb shows the other player's view, scan each tag, deny camera permission and use the manual field, lock and unlock the phone). Never claim the checklist passed.
4. For phone testing over HTTPS you have two routes. Evaluate which works and document it: (a) the DeepSpace `*.app.space` deploy once integrated; (b) a self-signed HTTPS dev server (for example Vite with a basic SSL plugin) on the local network. Camera and motion sensors require a secure context.
5. Say exactly what you ran and what you did not. Do not say something works unless you ran it.

## 9. Reporting format (after every task)

```
STATUS: Complete / Partially Complete / Blocked

FILES CHANGED:
- ...

WHAT WORKS:
- ...

TESTS RUN:
- ...

KNOWN ISSUES:
- ...

ASSUMPTIONS:
- ...

INTEGRATION NOTES:   (requests for backend/frontend, contract diffs)
- ...
```

Do not add features outside P0/P1 without approval. When time is short: cut features, do not add them.

---

## 10. Human setup (PowerShell; use `npx.cmd` if you ever type `npx`)

The AR agent runs in its own git worktree so it never collides with the backend agent.

1. From the repo root (`C:\Users\pjeni\Downloads\roomshift-ar`), make sure the docs are committed: `git status` should show nothing important unstaged.
2. Create the worktree and branch:
   ```
   git worktree add ..\roomshift-ar-agent -b feature/ar
   cd ..\roomshift-ar-agent
   ```
3. Put the AR module in, unless `ar\` already exists: unzip `roomshift-ar.zip` into the worktree root.
   ```
   Expand-Archive -Path "$HOME\Downloads\roomshift-ar.zip" -DestinationPath . -Force
   ```
4. Check the files exist (each line should print `True`):
   ```
   Test-Path docs\AR_AGENT.md
   Test-Path ROOMSHIFT_CONTEXT.md
   Test-Path ar\room\RoomScene.ts
   ```
   If `docs\AR_AGENT.md` is missing, copy this file into `docs\`.
5. Install and test the module:
   ```
   cd ar
   npm install
   npm run build
   cd ..
   ```
6. Commit the AR files: `git add ar docs && git commit -m "Add AR module and AR agent docs"`
7. Start Claude Code from the worktree root: `claude`
8. Paste Prompt A1 below. Paste the next prompt only after you have read the previous report.

## 11. Prompts to paste (in order)

### Prompt A1: Verify the existing module

```
You are the AR / Computer Vision Agent for RoomShift. Read docs/AR_AGENT.md, ROOMSHIFT_CONTEXT.md and CLAUDE.md fully. Work only on branch feature/ar and only in ar/**. Do not edit backend/** or frontend/**.

Task A1: verify the existing AR module before changing anything.
1. In ar/, run npm install and npm run build; show the output.
2. Read ar/README.md and the source, then tell me in numbered notes what is complete, what is untested on a real device, and the top 3 risks for phones (HTTPS, iOS motion permission, lighting).
3. Propose how we test on two real phones over HTTPS (DeepSpace deploy vs self-signed local HTTPS) and recommend one.
4. Write ar/MANUAL_TEST.md as described in section 8.
Do not add features. Report in the section 9 format.
```

### Prompt A2: QR scanner and printable tags

```
Task A2: implement the physical input from section 6 of docs/AR_AGENT.md.
1. Add a web-worker QR scanning library (justify the choice in one line) and implement ScanSession and ScanSequence in ar/ar-scan or a similar folder following the interface in section 6.
2. Tag payload format roomshift:v1:<objectId>; validate against OBJECT_IDS from shared/constants; reject everything else safely.
3. Debounce, camera release, and the fallbacks in order (permission denied, no camera, insecure context, manual code field).
4. Create ar/print/tags.html with one large QR per object (book, cup, keys) for printing.
5. Add a small standalone scan test page in ar/demo so I can try it on my phone.
6. Unit tests for payload parsing, debounce and the sequence helper; run them and npm run build.
Never treat a local result as proof; the server decides. Report in the section 9 format.
```

### Prompt A3: DeepSpace sync adapter (only after the backend agent has written docs/deepspace-notes.md)

```
Task A3: write ar/sync/DeepSpaceSync.ts implementing RoomSync, using the patterns in docs/deepspace-notes.md and the room-state contract in shared/types and shared/events. Read those first; if the backend has not defined the room state or events I need, list exactly what I need as numbered requests instead of guessing.
1. onState from DeepSpace room state; interact(id) sends a request and does not change local state optimistically in a way that can disagree with the server; presence throttled to about 10 Hz with a 3 s timeout.
2. Keep LocalSync working for offline testing. Keep demo-only rules out of the production path.
3. Wire the demo page to choose DeepSpaceSync when a room code exists on the DeepSpace app and LocalSync otherwise, or explain why that is not possible.
4. Run the build and any tests, and update ar/MANUAL_TEST.md. Report in the section 9 format.
```

### Prompt A4: Integration with the frontend

```
Task A4: integrate with the frontend. Read frontend/** (read only). Tell me where the room view and the scanner should mount, what props or events the frontend needs from ar/, and write the smallest clean exports from ar/ (an index file) so the frontend agent can import RoomScene, DeepSpaceSync, ScanSession and ScanSequence. List all requests for the frontend agent as numbered items. Do not edit frontend/**. Run the build and report in the section 9 format.
```

### Prompt A5: Phone hardening and polish

```
Task A5: harden for real phones. Using ar/MANUAL_TEST.md, review the code for: camera released on every exit path and when the tab is hidden, render loop paused when hidden, pixel ratio capped, graceful messages for denied camera and denied motion permission, a visible recenter control, readable text on small screens, and reconnect behavior of the room view when the connection drops and returns. Fix what you find without adding new features. Tune the TUNING light constants only if I report a specific problem. Run the build and tests; report in the section 9 format with a ranked list of remaining risks.
```

### Utility prompts

1. **Status:**
   ```
   Give me a numbered status: what works, what you ran, what is untested on a real device, and the current blocker. No code changes.
   ```
2. **Something broke on my phone:**
   ```
   Here is exactly what happens on my phone: <describe + paste any error>. Reproduce or reason about the cause first and tell me before changing anything, then fix the root cause, add a test if possible, and update ar/MANUAL_TEST.md.
   ```
3. **Context getting long:** type `/compact`, then paste: `Re-read docs/AR_AGENT.md and ar/README.md, then continue from the last report.`
4. **Before submission:**
   ```
   Prepare the AR module for submission: confirm npm run build passes, remove debug code, list any env vars the human must set, and add a short "How the AR room and scanning work" section to ar/README.md for the Devpost write-up. Do not add features.
   ```
