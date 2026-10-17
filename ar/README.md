# RoomShift AR module

The phone-camera side of RoomShift: the physical object puzzle (puzzle 1) and the shared 3D control room for Blackout Protocol. The puzzle uses on-device AI object detection for the book and the cup, and printed QR tags for the keys and as a full backup. It does not do world-anchored 3D tracking.

## How the AR room and scanning work

This section is written for the Devpost write-up. It only states what has been built and tested. Update the "Verification" line after the real-phone test.

**Physical puzzle, AI first.** A player points their phone camera at three real objects on a table: a book, a cup and a set of keys. A COCO-SSD object detection model, running on the phone with TensorFlow.js, recognizes the book and the cup without any tags and draws a box with its confidence on each. COCO-SSD has no "keys" class, so the keys carry a small printed QR tag, which the app reads from the same camera frame. The app sorts the three objects left to right and asks the team to hold the right arrangement steady for 1.2 seconds. It then sends the object positions to the RoomShift server, which re-derives the order and decides whether the puzzle is solved. The phone never declares a win by itself, and AI sightings alone can never complete the puzzle. Camera images never leave the phone.

**Fallbacks.** **QR Backup** reads printed QR tags on all three objects (the original scanner, decoded in a background worker about 8 times a second). If the AI model cannot load, or takes more than 15 seconds, the app offers QR Backup straight away. If the camera is blocked, missing, or the page is not on HTTPS, the player gets a clear message and a **Manual** mode, which is labelled as a fallback and recorded by the server as "manual". In dim light the QR scanner shows a lighting hint and, on phones that support it, a torch button.

**Shared room.** Every phone renders the same Blackout Protocol control room from one data template using three.js. The breaker lights, the terminal screen and the security door reflect the state the server sends, so all players see the facility come back to life together. Players look around by moving the phone (motion sensors) or by dragging, with a Recenter button.

**Phone care.** The camera is released whenever the scan screen closes or the page is hidden. The room stops rendering while hidden, caps its resolution, and recovers if the phone drops the graphics context. The layout is built for portrait phones down to 320 px wide.

**Why AI plus QR.** AI detection lets players use ordinary objects with no stickers. QR tags stay because COCO-SSD cannot see keys, and because tags are very reliable on ordinary phones when lighting or the model lets you down.

**Built with:** TypeScript, React 19, TensorFlow.js (WebGL), COCO-SSD, jsQR, three.js, Vite. No API keys or environment variables.

**Verification:** 70 unit tests and 20 browser tests pass in desktop Chrome. The browser tests use simulated cameras and phone-sized screens; the AI tests run the real COCO-SSD model on real CC0 photos of a book and a mug. The real-phone checklist is in `ar/MANUAL_TEST.md`. **Not yet run on a real phone.**

## Run

From the repository root, use Node.js 22.12+ or 24.

- **Physical puzzle demo:** `npm ci`, then `npm run dev`. The AI scanner is the default. Open **Marker cards** (or `ar/print/tags.html`) and print the three tags at actual size: the KEYS tag is needed in AI mode, all three in QR backup.
- **Shared room demo:** `cd ar`, `npm install`, then `npm run dev`. Tap **Host a room**, then join from a second tab with the 4-letter code or the guest URL in the message. This uses same-browser sync only (see "Shared AR room").

Phones need HTTPS for the camera and motion sensors; a plain `http://` LAN address will not work. Desktop `localhost` counts as secure.

## AI object detection (default scanner)

`PhysicalPuzzle` has three modes, switchable at any time without a reload. Switching stops the previous scanner and releases its camera first.

| Mode | Book | Cup | Keys | Result `evidence` |
|---|---|---|---|---|
| **AI scanner** (default) | AI | AI | QR tag, same frame | `{ book: "ai", cup: "ai", keys: "qr" }` |
| **QR backup** | QR tag | QR tag | QR tag | all `"qr"` |
| **Manual demo** | typed order | | | all `"manual"` |

**How it works.** Selecting AI scanner dynamically imports TensorFlow.js and COCO-SSD and loads the model once per page (`detect/cocoSsdDetector.ts`). Switching modes and remounting the puzzle reuse it; call `releaseCocoSsdDetector()` to free it when the game leaves puzzle 1. The camera opens only after the player taps **Start AI camera**. `detect/AiScanSession.ts` then runs one cycle at a time, at most about 4 per second: it draws the video into a 640 px wide canvas, runs the detector on it, and in parallel decodes QR tags from a 960 px copy of the same frame in the existing web worker (only for objects the model cannot see). Frames are processed in memory and discarded.

**Supported objects.** COCO-SSD recognizes 80 COCO classes; the puzzle uses `book` and `cup` (`COCO_CLASS_MAP`). Other classes, such as "person" or "dining table", are drawn dimmed so players can see what the model sees, but never count. **Keys are not a COCO class.** The app never claims to recognize keys by AI; the KEYS chip shows "NEEDS QR TAG" until the KEYS QR tag is seen.

**Thresholds** (`detect/objectClasses.ts`): book 0.45, cup 0.55, other classes 0.5. In our tests COCO-SSD lite scored a clear, upright book cover at only 0.45–0.55, and did not find a flat book half covered by a phone at all, so books get a lower bar. For the demo, show the book's cover to the camera. Overlapping boxes of one object (IoU above 0.5) are merged; two separate boxes of the same object (two cups) are kept and reported as "DUPLICATE OBJECT".

**Arrangement check.** The same `PhysicalOrderTracker` as the QR scanner, with AI tuning (`AI_TRACKER_OPTIONS` in `AiScanner.tsx`):

- the same 1.2 s hold, which must contain at least 3 fresh frames;
- box centers may drift up to 0.06 (QR: 0.035), and the row may span 0.3 vertically (QR: 0.16), because boxes of different-sized objects jitter more than QR corners;
- the allowed gap between fresh frames adapts to the device: about 3 times the measured frame interval, between 1 s and 2.5 s (`adaptiveFrameGap`). One slow inference does not reset a valid hold, but a stalled camera or model always does. Only the current frame's detections count; boxes remembered briefly for display (drawn dashed) never count as evidence.
- AI-mode results are reported only if every object is present and at least one came from a non-AI source (`hybridEvidenceAccepted`).

The QR scanner's own tuning is unchanged (500 ms gap, 0.035 drift, 0.16 row, 1 frame).

**Status messages:** INITIALIZING AI, CAMERA READY, SCANNING OBJECTS, BOOK + CUP DETECTED, OBJECT NOT RECOGNIZED, LINE THEM UP, WRONG ORDER, DUPLICATE OBJECT, HOLD STEADY, ARRANGEMENT VERIFIED, SWITCH TO QR BACKUP. Confidence values on screen are the model's real scores.

**Failures.** No WebGL: "unsupported". Model download failure: "model-failed", with **Switch to QR backup** and **Retry AI**. Loading for more than 15 s (`MODEL_LOAD_TIMEOUT_MS`): **Switch to QR backup** appears while loading continues in the background. Camera errors use the same messages as the QR scanner.

**Swapping the detector.** Any detector implementing `ObjectDetector` (`detect/ObjectDetector.ts`: `name`, `classMap`, `detect(canvas)`) can be passed to `PhysicalPuzzle` as `loadDetector`. A MediaPipe Object Detector with a custom model trained on keys would declare `keys` in its `classMap`; KEYS would then stop needing a QR tag automatically (`qrOnlyIds`). No such model exists yet.

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

**Testing object recognition.** `npm test` covers class mapping, box conversion, cover-crop mapping, confidence filtering, duplicates, hybrid evidence, ordering, hold timing, the adaptive gap and the model loader (mocked). `npm run test:browser` (`ar/tests/browser/ai.spec.ts`) runs the real model in Chrome on a fake camera made from two CC0 photos (`ar/tests/fixtures/`): it checks that BOOK and CUP are found with real scores, that the puzzle does not solve without the KEYS tag, that it solves with it, model-load failure and timeout, mode-switch camera release, page hiding, and a 320 px layout. In headless Chrome on the dev laptop (software WebGL) inference took about 1.3–1.5 s per frame; phones with GPU WebGL should be faster, but this is unmeasured. On a phone, follow section E of `ar/MANUAL_TEST.md`.

## QR Backup details

Select **QR backup**, then **Enable camera** and allow access. The app requests the rear camera without audio.

- All three tags must be visible, horizontally separated, in roughly the same row, and in the correct order for 1.2 s.
- Their centers must stay within 0.035 (normalized) of where the hold started. Larger motion restarts the hold; small jitter is tolerated.
- A missing or duplicate tag, a wrong order, or a gap of more than 500 ms between frames resets the hold.
- Overlays follow the unmirrored camera image.

The camera is released on completion, stop, mode change, unmount, or a hidden page. After the page is hidden, scanning needs an explicit restart.

If access is denied, the camera is unavailable, or tracking is unreliable, use **Manual demo**. It labels the result as manual and does not claim to verify physical objects.

### Tags and scanning contract (docs/AR_AGENT.md section 6)

1. **Tag payload:** exactly `roomshift:v1:<objectId>`, where `<objectId>` is one of `OBJECT_IDS` in `shared/constants` (`book`, `cup`, `keys`). Anything else, including the old `ROOMSHIFT:BOOK` cards and wrong-case ids, is ignored without an error (`scan/tagPayload.ts`). Reprint old cards.
2. **Worker decoding:** `scan/CameraScanSession.ts` captures frames (max 960 px wide, about 8 per second, one frame in flight) and decodes them with jsQR in `scan/decodeWorker.ts`. If the worker cannot start, it decodes on the main thread. jsQR is used rather than `qr-scanner` because the arrangement check needs every tag in one frame, and `qr-scanner` returns one code per frame.
3. **`ScanSession`** (`types.ts`), implemented by `CameraScanSession`: `start(video)`, `stop()`, `onScan(id)`, `onError({ code })` with `denied | no-camera | insecure-context | unknown`. Extras: `onMarkers(markers, now)` for the arrangement check, `onEnded("hidden" | "track-ended")`, `torchSupported()` and `setTorch(on)`.
4. **Debounce:** `onScan` fires once per tag sighting. A tag is ignored until it has been out of view for 1.5 s (`ScanDebouncer`). Each accepted scan vibrates where supported (Android).
5. **`ScanSequence`:** `append(id)` (repeats ignored), `clear()`, `current()`. `PhysicalPuzzle` shows it and reports it through `onScanSequence`.
6. **Printable tags:** `ar/print/tags.html` (7 cm QR per object with a large label). Regenerate it and `ar/public/markers/*.svg` with `npm run markers`.

### Result and submission

`PhysicalPuzzle` calls `onResult(result)` once, after the local check passes. The `PhysicalPuzzleResult` type lives in `ar/types.ts`:

```ts
{
  solved: true,
  markers: detections,                  // { id, center: { x, y }, corners: [...] }[]
  detectedIds: ['book', 'cup', 'keys'], // camera discovery order, not spatial order
  order: ['book', 'cup', 'keys'],       // left to right
  source: 'camera',                     // QR and AI+QR hybrid; or 'manual'
  heldForMs: 1200,
  evidence: { book: 'ai', cup: 'ai', keys: 'qr' } // per object: 'ai' | 'qr' | 'manual'
}
```

Manual results have `markers: []`, `detectedIds: []`, `heldForMs: 0` and every `evidence` value `"manual"`. AI markers also carry `evidence`, `score` and `label`; the server's request schema strips these unknown keys today, so they are informational only. For AI objects, `center` is the bounding-box center and `corners` the box corners.

What to send in `puzzle:submit` (see `checkPuzzle1` in the backend and `docs/game-api.md`):
1. Prefer `physical` = the `onResult` value. The server sorts marker centers itself and requires a 1.2 s hold; it ignores the client's `solved`, `order` and `detectedIds`.
2. Otherwise `scanned` = the scan sequence.
3. Otherwise `manualCode` (for example `BCK`).

Client evidence is not tamper-proof and never authorizes a win on its own.

`detectMarkers` (no React) accepts RGBA frame pixels. It searches overlapping vertical strips so finder patterns from neighbouring QR codes don't mix, then masks each decoded code to avoid reading it twice. Two physical cards with the same id stay separate detections, and the validator rejects them. Limits: 960 px wide, at most eight codes per frame, about eight frames per second. Camera focus, lighting, perspective and device speed still affect reliability.

`PhysicalOrderTracker` (no React) takes normalized detections and a monotonic timestamp. `toCameraResult` gives a serializable result on any frame, including `solved: false` before the hold completes:

```ts
import { detectMarkers, PhysicalOrderTracker, toCameraResult } from './ar';

const tracker = new PhysicalOrderTracker(); // one tracker per scan session
const markers = detectMarkers(rgbaPixels, width, height);
const result = toCameraResult(markers, tracker.update(markers, performance.now()));
```

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
- hold stability, permission errors and manual validation
- simulated live-camera verification and camera release
- the room view at 320 px: toolbar, paused rendering, WebGL context loss, iOS-safe form controls, `RoomScene.stop()`
- AI detection logic (see "AI object detection") and the real COCO-SSD model on photo fixtures. The AI browser tests launch Chrome with `--enable-unsafe-swiftshader` so headless WebGL works; they take about 2–3 minutes on the dev laptop.

Playwright reuses any server already on port 5173. Stop other `vite`/`vite preview` processes first, or the tests run against the wrong build.

Simulated tests do not replace the real-phone checklist in `ar/MANUAL_TEST.md`.

The printable SVGs (`ar/public/markers/`) and `ar/print/tags.html` are checked in. `qrcode` is a development dependency used to generate them and the test images; it is not shipped in the app bundle.

## Environment variables

None. The AR module uses no API keys or secrets. Camera images never leave the phone.
