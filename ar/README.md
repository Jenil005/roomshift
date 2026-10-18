# RoomShift AR module

The phone-camera side of RoomShift: the physical object puzzle (puzzle 1) and the shared 3D control room for Blackout Protocol. The puzzle scans a book, a cup and a keyboard one at a time with on-device AI object detection; printed QR tags are an optional backup. `facility/` adds the world-tracked facility the game uses (Niantic XR Engine + Three.js).

## In the RoomShift game

The game (`frontend/`) uses this module as follows. Sections further down describe the module itself and the AR team's standalone demos.

| Game feature | Module code | Notes |
|---|---|---|
| Puzzle 1 scanner | `PhysicalPuzzle` with `scans` and `serverJudged` | Each newly recognized object goes to the server (`puzzle1:scan`), which keeps the team's progress and judges the sequence. AI, QR backup and manual modes as described below |
| Detector | `detect/selectDetector.ts` → `cocoSsdDetector.ts` (default) or `mediapipeDetector.ts` | `?detector=coco|mediapipe|auto`. MediaPipe Tasks Vision 1.0.1 with EfficientDet-Lite0 float16; display thresholds book 0.35, cup 0.4, keyboard 0.45; scan thresholds `MEDIAPIPE_SCAN_CONFIDENCE`. Both models map COCO `book`, `cup` and `keyboard` |
| World-tracked facility | `facility/session.ts`, `facility/scene.ts`, `facility/placement.ts` | Typed port of `public/ar-room.js`, `facility.js`, `room-placement.js` (same placement tests). Facility lights, terminal and door follow the server's `room.systems`; taps on the 3D terminal send real `puzzle2:draft` requests |
| Scan in AR | `FacilitySession.tapFrames` + `detect/CameraFrameScanner.ts` (game: `frontend/src/facility/useArScan.ts`) | During Puzzle 1, SCAN IN AR runs the detector on the XR engine's own camera frames (public `XR8.CameraPixelArray`, 640 px), so the facility stays placed and no second camera opens. Same one-object-at-a-time rules. `?scanflip` flips frames if a device delivers them upside down. Tested only with the XR8 test double |
| One camera owner | `FacilitySession.stopAR()` before the scanner mounts | The scanner and the XR Engine never hold the camera at the same time |
| Tester diagnostics | `debugChannel.ts` | Camera owner, detector and inference time, tracking status; shown by the game's `?debug` overlay |

The `room/RoomScene.ts` shared room and `sync/` classes are used only by the standalone demo (`demo/`), not by the game. Desktop verification is in `docs/INTEGRATION_TEST_RESULTS.md`; nothing here is iPhone-verified yet (`docs/IPHONE_FINAL_ACCEPTANCE.md`).

## How the AR room and scanning work

This section is written for the Devpost write-up. It only states what has been built and tested. Update the "Verification" line after the real-phone test.

**Physical puzzle, AI first.** The team agrees on an order from their clues, then a player scans three real objects one at a time: a book, a cup and a keyboard. A COCO-SSD object detection model, running on the phone with TensorFlow.js, recognizes each object without tags. As soon as one frame shows a single new object with enough confidence, it is marked SCANNED with a green check and stays scanned when the camera moves on; no hold, no QR code and no three-object frame. Each scan goes to the RoomShift server, which keeps the team's progress and checks it against the sequence; an object out of sequence clears the progress after a one-second cooldown. The phone never declares a win by itself. Camera images never leave the phone.

**Fallbacks.** **QR Backup** reads printed QR tags, one tag at a time with the same rules (decoded in a background worker about 8 times a second). If the AI model cannot load, or takes more than 15 seconds, the app offers QR Backup straight away. If the camera is blocked, missing, or the page is not on HTTPS, the player gets a clear message and a **Manual** mode, which is labelled as a fallback and recorded by the server as "manual". In dim light the QR scanner shows a lighting hint and, on phones that support it, a torch button.

**Shared room.** Every phone renders the same Blackout Protocol control room from one data template using three.js. The breaker lights, the terminal screen and the security door reflect the state the server sends, so all players see the facility come back to life together. Players look around by moving the phone (motion sensors) or by dragging, with a Recenter button.

**Phone care.** The camera is released whenever the scan screen closes or the page is hidden. The room stops rendering while hidden, caps its resolution, and recovers if the phone drops the graphics context. The layout is built for portrait phones down to 320 px wide.

**Why AI plus QR.** AI detection lets players use ordinary objects with no stickers. QR tags stay as a backup because they are very reliable on ordinary phones when lighting or the model lets you down.

**Built with:** TypeScript, React 19, TensorFlow.js (WebGL), COCO-SSD, jsQR, three.js, Vite. No API keys or environment variables.

**Verification:** unit tests and browser tests pass in desktop Chrome (`npm test`, `npm run test:browser`). The browser tests use simulated cameras and phone-sized screens; the AI tests run the real COCO-SSD model on real CC0 photos of a book and a mug. The real-phone checklist is in `ar/MANUAL_TEST.md`. **Not yet run on a real phone.**

## Run

From the repository root, use Node.js 22.12+ or 24.

- **Physical puzzle demo:** `npm ci`, then `npm run dev`. The AI scanner is the default. Open **Marker cards** (or `ar/print/tags.html`) and print the three tags at actual size if you want the QR backup; AI mode needs none.
- **Shared room demo:** `cd ar`, `npm install`, then `npm run dev`. Tap **Host a room**, then join from a second tab with the 4-letter code or the guest URL in the message. This uses same-browser sync only (see "Shared AR room").

Phones need HTTPS for the camera and motion sensors; a plain `http://` LAN address will not work. Desktop `localhost` counts as secure.

## AI object detection (default scanner)

`PhysicalPuzzle` has three modes, switchable at any time without a reload. Switching stops the previous scanner and releases its camera first.

| Mode | Book | Cup | Keyboard | Result `evidence` |
|---|---|---|---|---|
| **AI scanner** (default) | AI | AI | AI | `{ book: "ai", cup: "ai", keyboard: "ai" }` |
| **QR backup** | QR tag | QR tag | QR tag | all `"qr"` |
| **Manual demo** | reported sequence | | | all `"manual"` |

**How it works.** Selecting AI scanner dynamically imports TensorFlow.js and COCO-SSD and loads the model once per page (`detect/cocoSsdDetector.ts`). Switching modes and remounting the puzzle reuse it; call `releaseCocoSsdDetector()` to free it when the game leaves puzzle 1. The camera opens only after the player taps **Start AI camera**. `detect/AiScanSession.ts` then runs one cycle at a time, at most about 4 per second: it draws the video into a 640 px wide canvas, runs the detector on it, and in parallel decodes QR tags from a 960 px copy of the same frame in the existing web worker (only for objects the model cannot see). Frames are processed in memory and discarded.

**Supported objects.** COCO-SSD recognizes 80 COCO classes; the puzzle uses `book`, `cup` and `keyboard` (`COCO_CLASS_MAP`). Other classes, such as "person" or "dining table", are drawn dimmed so players can see what the model sees, but never count.

**Thresholds** (`detect/objectClasses.ts`). Display: book 0.45, cup 0.55, others 0.5 (`AI_CONFIDENCE`). Scanning: one frame marks an object scanned for good, so the bar is stricter, book 0.5, cup 0.6, others 0.55 (`AI_SCAN_CONFIDENCE`; MediaPipe has its own `MEDIAPIPE_SCAN_CONFIDENCE` because its scores run lower), and never below the server's floor `PUZZLE1_SCAN_MIN_CONFIDENCE` (0.35). These were chosen from desktop photo tests (COCO-SSD book 0.67, cup 0.96; MediaPipe book 0.42, cup 0.79) and are **not yet tuned on an iPhone or on real keyboards**.

**Sequential scanning** (`scan/objectScan.ts`, `ScanProgress.tsx`):

- `decideFrame`: exactly one new confident object in the frame is reported (`onObjectScanned`); an already scanned object in view shows "BOOK ALREADY SCANNED"; two or more new objects at once record nothing and ask for one at a time, so a crowded frame cannot scan them in an accidental order.
- Progress (`scanned`) is owned by the host: in the game, the server's accepted scans plus this phone's queued ones; in the standalone demo, `LocalScanJudge` applies the same sequence rule.
- Messages: "BOOK SCANNED ✓ — FIND THE CUP", "CUP SCANNED ✓ — FIND THE KEYBOARD", "KEYBOARD SCANNED ✓ — VERIFYING SEQUENCE", then "BREAKER RESTORED — PUZZLE COMPLETE" only after the server accepts the sequence.
- The camera stops once all three are scanned.

**Status messages:** INITIALIZING AI, CAMERA READY, POINT AT ONE OBJECT, OBJECT NOT RECOGNIZED, the scan messages above, BREAKER RESETTING, SWITCH TO QR BACKUP. Confidence values on screen are the model's real scores.

**Failures.** No WebGL: "unsupported". Model download failure: "model-failed", with **Switch to QR backup** and **Retry AI**. Loading for more than 15 s (`MODEL_LOAD_TIMEOUT_MS`): **Switch to QR backup** appears while loading continues in the background. Camera errors use the same messages as the QR scanner.

**Swapping the detector.** Any detector implementing `ObjectDetector` (`detect/ObjectDetector.ts`: `name`, `classMap`, `detect(canvas)`) can be passed to `PhysicalPuzzle` as `loadDetector`. A detector declares its own `thresholds` and `scanThresholds`, since scores are not comparable across models. `detect/mediapipeDetector.ts` is a MediaPipe adapter with the stock EfficientDet-Lite0 model.

**iPhone / PWA notes.** Inference is frontend-only (TF.js WebGL backend), with no native ARKit. The video element is `muted` and `playsinline`; the camera starts only after a tap; the session stops all tracks when the page is hidden (`visibilitychange`), on mode switch, on Stop camera and on unmount, and scanning needs an explicit restart after the page was hidden. `PhysicalPuzzle` calls `onScanningChange(true)` while a camera scan is live so the host can call `RoomScene.stop()` and resume with `start()` afterwards. The first load downloads about 18 MB of model weights, so use Wi-Fi; the browser caches them afterwards (the app has no service worker, so offline use is not guaranteed). Not yet run on an iPhone.

**Dependencies and licenses** (all Apache-2.0, all lazy-loaded):

| Package | Why | Size (minified / gzip) |
|---|---|---|
| `@tensorflow/tfjs-core` 4.22 | tensors and ops | 260 kB / 82 kB |
| `@tensorflow/tfjs-backend-webgl` 4.22 | GPU inference on the phone | 355 kB / 84 kB |
| `@tensorflow/tfjs-converter` 4.22 | loads the graph model (bundled with coco-ssd chunk) | |
| `@tensorflow-models/coco-ssd` 2.2.3 | the detector wrapper | 138 kB / 29 kB with converter |
| COCO-SSD `lite_mobilenet_v2` weights | the model, self-hosted in `ar/public/models/coco-ssd/` (see its `NOTICE.md`) | 17.5 MB |

These modular packages are used instead of the `@tensorflow/tfjs` umbrella package, which would add unused layers/data code. The main bundle grew by about 18 kB (about 6 kB gzip) for the AI scanner UI; everything above loads only when AI scanner is shown.

**Testing object recognition.** `npm test` covers class mapping, box conversion, cover-crop mapping, display and scan thresholds, duplicates, single-object scan decisions, scan messages, the local judge and the model loader (mocked). `npm run test:browser` (`ar/tests/browser/ai.spec.ts`) runs the real model in Chrome on a fake camera made from two CC0 photos (`ar/tests/fixtures/`): BOOK then CUP are scanned one at a time and stay scanned out of frame, a repeat shows ALREADY SCANNED, a crowded frame records nothing, an out-of-sequence first scan resets, and KEYBOARD is scanned by its QR tag (no keyboard photo fixture yet). Also model-load failure and timeout, mode-switch camera release, page hiding, and a 320 px layout. On a phone, follow section E of `ar/MANUAL_TEST.md`.

## QR Backup details

Select **QR backup**, then **Enable camera** and allow access. The app requests the rear camera without audio.

- Show one tag at a time; each new tag is scanned at once and stays scanned. Same rules as the AI scanner (duplicates, one new object per frame, sequence judged by the host).
- Overlays follow the unmirrored camera image.

The camera is released on completion, stop, mode change, unmount, or a hidden page. After the page is hidden, scanning needs an explicit restart.

If access is denied, the camera is unavailable, or tracking is unreliable, use **Manual demo**. It labels the result as manual and does not claim to verify physical objects.

### Tags and scanning contract (docs/AR_AGENT.md section 6)

1. **Tag payload:** exactly `roomshift:v1:<objectId>`, where `<objectId>` is one of `OBJECT_IDS` in `shared/constants` (`book`, `cup`, `keyboard`). Anything else, including the old `ROOMSHIFT:BOOK` cards and wrong-case ids, is ignored without an error (`scan/tagPayload.ts`). Reprint old cards.
2. **Worker decoding:** `scan/CameraScanSession.ts` captures frames (max 960 px wide, about 8 per second, one frame in flight) and decodes them with jsQR in `scan/decodeWorker.ts`. If the worker cannot start, it decodes on the main thread. jsQR is used rather than `qr-scanner` because it returns every tag in a frame, which lets the scanner tell a crowded frame from a single tag.
3. **`ScanSession`** (`types.ts`), implemented by `CameraScanSession`: `start(video)`, `stop()`, `onScan(id)`, `onError({ code })` with `denied | no-camera | insecure-context | unknown`. Extras: `onMarkers(markers, now)` for per-frame scanning, `onEnded("hidden" | "track-ended")`, `torchSupported()` and `setTorch(on)`.
4. **Debounce:** `onScan` fires once per tag sighting. A tag is ignored until it has been out of view for 1.5 s (`ScanDebouncer`). Each accepted scan vibrates where supported (Android).
5. **`ScanSequence`:** `append(id)` (repeats ignored), `clear()`, `current()`. `PhysicalPuzzle` shows it and reports it through `onScanSequence`.
6. **Printable tags:** `ar/print/tags.html` (7 cm QR per object with a large label). Regenerate it and `ar/public/markers/*.svg` with `npm run markers`.

### Result and submission

With a game server, pass `scans` (`HostScans`): `scanned`, `pending`, `onObjectScanned(report)`, `notice`, `paused`, `onRestart`. Each `ObjectScanReport` is `{ id, evidence: 'ai' | 'qr', score? }`; the game sends it as `puzzle1:scan` (see `docs/game-api.md`). `onResult` then carries only the manual report:

```ts
{ solved: false, detectedIds: [], order: ['book', 'cup', 'keyboard'], source: 'manual', evidence: { book: 'manual', cup: 'manual', keyboard: 'manual' } }
```

Without `scans` (standalone demo) the component judges locally and `onResult` also reports a completed scan sequence with `source: 'camera'` and per-object `evidence`.

Client evidence is not tamper-proof and never authorizes a win on its own.

`detectMarkers` (no React) accepts RGBA frame pixels. It searches overlapping vertical strips so finder patterns from neighbouring QR codes don't mix, then masks each decoded code to avoid reading it twice. Two physical cards with the same id stay separate detections. Limits: 960 px wide, at most eight codes per frame, about eight frames per second. Camera focus, lighting, perspective and device speed still affect reliability.

## Frontend integration

Two entry points, both React 19 compatible:

| Import | What | Needs |
|---|---|---|
| `ar` (`ar/index.ts`) | `PhysicalPuzzle` (loads its own scoped `PhysicalPuzzle.css`), `AiScanner`, `AiScanSession`, `loadCocoSsdDetector` / `releaseCocoSsdDetector`, `CameraScanSession`, `ScanSequence`, tag helpers, types | `react`, `jsqr`, `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow-models/coco-ssd` (the last four are lazy-loaded) |
| `ar/room` (`ar/room/index.ts`) | `RoomScene` (with `start()` / `stop()`), `blackoutProtocol`, `LookControls`, `RoomSync`, `LocalSync`, room types | `three` |

**Required in the consuming app's `vite.config.ts`:** `resolve: { dedupe: ["react", "react-dom"] }`. Without it, files under `ar/` resolve a second copy of React and `PhysicalPuzzle` crashes with `Cannot read properties of null (reading 'useState')` (verified with an outside test build).

**Required for the AI scanner:** serve `ar/public/models/coco-ssd/` at `<BASE_URL>models/coco-ssd/` (for example `publicDir: "ar/public"` as in the root `vite.config.ts`, or copy the folder into the app's `public/`). `COCO_SSD_MODEL_URL` is built from Vite's `import.meta.env.BASE_URL`. Install the four TensorFlow packages above in the consuming app. Without the model files the AI scanner shows "could not be loaded" and offers QR backup.

**Optional:** pass `onScanningChange={(on) => on ? scene.current?.stop() : scene.current?.start()}` to pause the 3D room while scanning, and call `releaseCocoSsdDetector()` when the phase leaves `PUZZLE_1`.

**Puzzle 1 screen** (`room.phase === "PUZZLE_1"`), sketch:

```tsx
const [attempt, setAttempt] = useState(0);
const submit = async (physical: PhysicalPuzzleResult) => {
  const res = await gameRequest<{ solved: boolean; reason?: string; retryAfterMs?: number }>(
    { type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 1, physical } },
    session,
  );
  if (res.ok && res.data.solved) return; // the server moves every phone to PUZZLE_1_COMPLETE
  // Show res.data.reason / res.message, then mount a fresh puzzle for the next try.
  setTimeout(() => setAttempt((n) => n + 1), (res.ok ? res.data.retryAfterMs : res.retryAfterMs) ?? 0);
};
return <PhysicalPuzzle key={attempt} onResult={submit} />;
```

**Room view** (any phase from INTRO to COMPLETE), sketch:

```tsx
const canvas = useRef<HTMLCanvasElement>(null);
const scene = useRef<RoomScene | null>(null);
useEffect(() => {
  const s = new RoomScene(canvas.current!, blackoutProtocol);
  s.start();
  scene.current = s;
  return () => s.dispose(); // releases listeners and the WebGL context
}, []);
useEffect(() => {
  if (room) scene.current?.applyState({ version: room.version, systems: room.systems });
}, [room]);
// <canvas ref={canvas} /> plus a "Motion" button calling scene.current?.controls.enableGyro()
// (iOS needs a tap) and a "Recenter" button calling scene.current?.controls.recenter().
// After enableGyro(), show a message for scene.current.controls.gyroStatus (see demo/main.ts).
```

`room.systems` and `room.version` from `useRoomView` have exactly the shape `RoomScene.applyState` takes. Taps (`scene.onInteract`) are hints only: the server changes `systems` through the puzzles, never through a tap.

## Shared AR room (Blackout Protocol)

A shared virtual room, not a live camera view. Every device builds the same room from one template (`templates/blackoutProtocol.ts`) and renders the same synced state. The phone acts as a window: move it (motion sensors) or drag to look around.

1. `templates/`: pure-data room definitions (one template per mission).
2. `room/RoomScene.ts`: three.js scene with `applyState(state)`, `setPeers(list)`, `onInteract(cb)`, `start()` and `dispose()`. It renders only while started and the page is visible.
3. `room/LookControls.ts`: motion and drag look. iOS needs HTTPS and a button tap; `gyroStatus` says why motion is off.
4. `sync/RoomSync.ts`: the network interface the standalone demo uses.
5. `sync/LocalSync.ts`: same-browser test sync (BroadcastChannel). It never connects two phones.
6. `sync/rules.ts`: demo-only gating used by `LocalSync`. The real rules live in the backend.

In the real app the room is fed straight from the server's room state (see "Frontend integration"), so no extra sync class is needed. A `DeepSpaceSync` implementing `RoomSync` would only be needed to show where other players are looking (the peer orbs), and that needs a presence channel.

Known limits:
1. Not yet viewed on a real phone. Expect to tune `TUNING` in `RoomScene.ts` (light brightness) on a phone.
2. The starting direction depends on how the phone is held when Motion is tapped; players should tap Recenter.
3. Room geometry is simple primitives.

## Checks

```sh
npm test               # unit tests (vitest), from the repository root
npm run build          # repository root: puzzle demo
npm run test:browser   # Playwright browser tests
cd ar && npm run build # shared room demo
```

Browser tests use a system Chromium at `/usr/bin/chromium` if present. On Windows, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`). Otherwise install the Playwright browser with `npx playwright install chromium`.

The tests cover:
- real QR image decoding, and missing, duplicate and wrong markers
- one-at-a-time scanning, permission errors and manual validation
- simulated live-camera verification and camera release
- the room view at 320 px: toolbar, paused rendering, WebGL context loss, iOS-safe form controls, `RoomScene.stop()`
- AI detection logic (see "AI object detection") and the real COCO-SSD model on photo fixtures. The AI browser tests launch Chrome with `--enable-unsafe-swiftshader` so headless WebGL works; they take about 2–3 minutes on the dev laptop.

Playwright reuses any server already on port 5173. Stop other `vite`/`vite preview` processes first, or the tests run against the wrong build.

Simulated tests do not replace the real-phone checklist in `ar/MANUAL_TEST.md`.

The printable SVGs (`ar/public/markers/`) and `ar/print/tags.html` are checked in. `qrcode` is a development dependency used to generate them and the test images; it is not shipped in the app bundle.

## Environment variables

None. The AR module uses no API keys or secrets. Camera images never leave the phone.
