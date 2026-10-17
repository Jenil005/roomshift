# RoomShift physical puzzle

The AR module recognizes the supplied QR markers on a book, cup, and set of keys. It draws outlines and names over the camera image and checks the documented **BOOK → CUP → KEYS** arrangement. This is marker-based vision, not arbitrary object recognition or world-anchored 3D tracking.

## Solution and scope

Issue #3 uses `jsQR`, a lightweight JavaScript QR decoder. Printed QR cards are distinct fiducials with corners in camera-image coordinates, so no world tracking, 3D engine, GPU model, or external service is needed. Camera access uses the browser `getUserMedia` API. This is sufficient for projected left-to-right order and leaves multiplayer authority with the backend.

## Tags and scanning contract (docs/AR_AGENT.md section 6)

1. **Tag payload:** exactly `roomshift:v1:<objectId>`, where `<objectId>` is one of `OBJECT_IDS` in `shared/constants` (`book`, `cup`, `keys`). Anything else, including the old `ROOMSHIFT:BOOK` cards and wrong-case ids, is ignored without an error (`scan/tagPayload.ts`). Reprint old cards.
2. **Worker decoding:** `scan/CameraScanSession.ts` captures frames (max 960 px wide, about 8 per second, one frame in flight) and decodes them with jsQR in `scan/decodeWorker.ts`. If the worker cannot start, it decodes on the main thread. jsQR is kept rather than `qr-scanner` because the arrangement check needs every card in one frame, and `qr-scanner` returns one code per frame.
3. **`ScanSession`** (`types.ts`), implemented by `CameraScanSession`: `start(video)`, `stop()`, `onScan(id)`, `onError({ code })` with `denied | no-camera | insecure-context | unknown`. Extras: `onMarkers(markers, now)` for the arrangement check, `onEnded("hidden" | "track-ended")`, `torchSupported()` and `setTorch(on)`. The camera is released on `stop()`, when the page is hidden, and when the track ends.
4. **Debounce:** `onScan` fires once per tag sighting. A tag is ignored until it has been out of view for 1.5 s (`ScanDebouncer`). Each accepted scan vibrates where supported (Android).
5. **`ScanSequence`:** `append(id)` (repeats ignored), `clear()`, `current()`. `PhysicalPuzzle` shows it and reports it through `onScanSequence`.
6. **Printable tags:** `ar/print/tags.html` (7 cm QR per object with a large label). Regenerate it and `ar/public/markers/*.svg` with `npm run markers`.

What to send in `puzzle:submit` (see `checkPuzzle1` on `feature/backend`): prefer `physical` = the `onResult` value (the server sorts marker centers itself and requires a 1.2 s hold), else `scanned` = the scan sequence, else `manualCode` (for example `BCK`). Never send a local `solved` as proof.

Implementation, types, demo UI, assets, generation script, and tests live under `ar/`. Root package/build files provide the runnable harness because the repository previously contained only placeholders. No backend or shared files are changed.

## Run and play

From the repository root, use Node.js 22.12+ or 24:

```sh
npm ci
npm run dev
```

Open the running application, select **Marker cards**, and print the three cards at actual size. Put each marker on its matching object. Keep the white QR borders intact. Position the objects side by side with the marker faces pointed toward the camera. Rotate the phone to landscape if needed to fit the row.

Select **Enable camera** and allow access. The app requests the rear camera without audio. All three markers must be visible, horizontally separated, in roughly the same row, and correctly ordered for 1.2 seconds. Their normalized center positions must stay within 0.035 of the positions at the beginning of that hold; larger motion resets the timer, while small tracking jitter is tolerated. Missing/duplicate markers, a wrong order, or a gap over 500 ms resets the hold. Overlays follow the unmirrored camera image. The app releases camera tracks on completion, stop, mode change, unmount, or a hidden page. Returning to a hidden page requires an explicit restart.

Mobile camera access requires an HTTPS deployment; an ordinary HTTP LAN address will not work. Desktop loopback is also a browser-supported secure context. No API keys are needed. Frames stay in the browser and are not uploaded or stored.

If access is denied, the camera is unavailable, or tracking is unreliable, use **Manual demo**. It checks the entered order and explicitly identifies the result as manual; it does not claim to verify physical objects.

## Integration

`PhysicalPuzzle` in `ar/PhysicalPuzzle.tsx` provides the camera/manual UI and calls `onResult(result)` after the local check. Import `ar/demo/styles.css` for its current presentation. The surrounding app owns mission transitions. Mount a fresh component for each puzzle attempt.

The exported `PhysicalPuzzleResult` contract lives in `ar/types.ts` so other teams can consume it without changing shared files:

```ts
{
  solved: true,
  markers: detections,                // { id, center: { x, y }, corners: [...] }[]
  detectedIds: ['book', 'cup', 'keys'], // camera discovery order, not spatial order
  order: ['book', 'cup', 'keys'],       // left to right
  source: 'camera',                   // or 'manual'
  heldForMs: 1200
}
```

Manual submissions have `markers: []`, `detectedIds: []` and `heldForMs: 0`. The current frontend shows a **local puzzle result only**. There is no multiplayer backend yet. When integrating DeepSpace, submit this evidence with authenticated room/player context to the authoritative server. The server must validate the current phase, expected order, required participants, and whether manual submissions are allowed. Client evidence is not tamper-proof and must not authorize a mission win on its own.

`detectMarkers` is independent of React and accepts RGBA frame pixels. It searches overlapping vertical regions to avoid mixing finder patterns from multiple QR codes, then masks decoded regions to avoid duplicate reads. Separate physical cards carrying the same ID remain separate detections and are rejected by the validator. Processing is limited to 960 pixels wide, at most eight decoded QR codes per frame, and approximately eight scans per second, in a web worker. Camera focus, lighting, perspective, and device speed still affect reliability.

`PhysicalOrderTracker` is also UI-independent. It accepts normalized detections and a monotonic timestamp. Use `toCameraResult` to get a serializable result on any frame, including `solved: false` before the full hold:

```ts
import { detectMarkers, PhysicalOrderTracker, toCameraResult } from './ar';

const tracker = new PhysicalOrderTracker(); // retain one tracker per scan session
const markers = detectMarkers(rgbaPixels, width, height);
const result = toCameraResult(markers, tracker.update(markers, performance.now()));
// Forward result through your existing room action transport when appropriate.
// Reset tracker when the puzzle attempt or camera session changes.
```

The component calls `onResult` once on successful camera verification. Manual mode sends a separately tagged submission. These APIs can support future cooperative object targets without coupling camera processing to game state.

## Checks

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use a system Chromium at `/usr/bin/chromium` if present. On Windows, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`). Else install the Playwright browser with `npx playwright install chromium`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another executable. Tests cover real QR raster decoding, missing/duplicate/wrong markers, temporal stability, permission errors, manual validation, simulated live-camera verification, track cleanup, and mobile layout. Simulated camera tests do not replace a real-device trial on iOS Safari and Android Chrome.

The printable SVGs (`ar/public/markers/`) and `ar/print/tags.html` are checked in. Regenerate them with `npm run markers` if the marker format changes. `qrcode` is a development dependency used to generate these assets and test inputs; it is not shipped in the application bundle.

## Real-phone test procedure (not yet performed)

1. Run `npm ci` and `npm run build`. Serve the generated `dist/` directory from an HTTPS static host with a certificate trusted by the phone. Alternatively, use a trusted HTTPS development tunnel to the Vite server. Open that HTTPS address in current iOS Safari or Android Chrome; plain HTTP over a LAN does not grant camera access.
2. Open **Marker cards** and print all three at actual size. Cut outside the white quiet zone. Attach them to BOOK, CUP, and KEYS with the marker faces pointing toward the camera. Use even lighting and keep the cards separated in a single row.
3. Tap **Enable camera**, grant permission, and confirm the rear-camera feed is visible. Confirm outlines and the BOOK/CUP/KEYS badges correspond to the actual cards. Check landscape and portrait orientation.
4. Start with a wrong order. All three cards should be detected, but the puzzle must remain unsolved. Hide a card and confirm its badge clears and progress resets. Add a duplicate card and confirm the duplicate warning.
5. Arrange **BOOK → CUP → KEYS**. Move a card or the phone enough to shift the projected position while keeping the same order; the hold must reset. Then keep all cards steady for 1.2 seconds. Confirm the puzzle completes once and the camera indicator turns off.
6. Reset the puzzle. Deny camera permission, test permission recovery using browser settings, and try the **Manual demo**. A correct manual arrangement must be labeled manual, with no claim of camera verification.
7. Start scanning and switch apps or lock the phone. Return and confirm scanning is paused and requires an explicit restart. Also check **Stop camera**, switching modes, and a second puzzle attempt.
8. Record phone model, OS/browser version, lighting, print size, camera orientation, time to detect all cards, and pass/fail observations. Test at least one iPhone and one Android phone before describing the feature as phone-validated.

Current validation is automated QR-image decoding and Chromium browser tests using a simulated camera stream. **No real-phone or multiplayer testing has been performed.**

## Shared AR room (Blackout Protocol)

Restored from `roomshift-ar.zip`; the 3D room lives alongside the marker puzzle above and has its own harness in `ar/` (`npm install && npm run build` / `npm run dev`, entry `ar/index.html` → `demo/main.ts`).
A shared virtual room, not a live camera view. Both devices build the same room from one
template (`templates/blackoutProtocol.ts`) and render the same synced state. A phone acts as a
window: move it (gyro) or drag to look around.

### Run
1. `cd ar && npm install && npm run dev`
2. Open the printed URL, tap **Host a room**.
3. Open the guest URL (shown in the toast and console) in a second tab. Both tabs show the same room.
4. Tap the bobbing diamond: breaker, then terminal, then door. The orb is the other player's view direction.

### Architecture
1. `templates/` pure-data room definitions (add a template per mission)
2. `room/RoomScene.ts` three.js scene: `applyState(state)`, `setPeers(list)`, `onInteract(cb)`
3. `room/LookControls.ts` gyro and drag look (iOS needs HTTPS and a button tap)
4. `sync/RoomSync.ts` the only network interface the scene sees
5. `sync/LocalSync.ts` same-browser test sync (BroadcastChannel). Not for real phones
6. `sync/rules.ts` demo-only gating. Real rules belong in the DeepSpace backend

### Wiring DeepSpace (next step)
Write `DeepSpaceSync implements RoomSync`:
1. `onState`: subscribe to the room's `RoomState` record
2. `interact`: send a request to the backend; the server validates and updates state
3. `sendPresence` / `onPeers`: map to DeepSpace presence, throttled to ~10 Hz
4. Replace `new LocalSync(...)` in `demo/main.ts` (or the real app) with it

### Known limits
1. Typechecked and built, but not yet viewed on a real device. Expect to tune `TUNING` in `RoomScene.ts` (light brightness) on a phone
2. Phone motion needs HTTPS: DeepSpace's `*.app.space` deploy provides it
3. Room geometry is simple primitives; swap in a GLB model later if time allows
