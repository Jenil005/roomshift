# RoomShift AR module

The phone-camera side of RoomShift: the physical object puzzle (puzzle 1) and the shared 3D control room for Blackout Protocol. It is marker-based vision, not arbitrary object recognition or world-anchored 3D tracking.

## How the AR room and scanning work

This section is written for the Devpost write-up. It only states what has been built and tested. Update the "Verification" line after the real-phone test.

**Physical puzzle.** Each real object (a book, a cup, a set of keys) carries a printed QR tag. A player points their phone camera at the table. The app decodes the tags on the phone in a background web worker, about 8 frames per second, and never uploads or stores camera images. It finds all three tags in a single frame, sorts them left to right, and asks the team to hold the right arrangement steady for 1.2 seconds. It then sends the tag positions to the RoomShift server. The server re-derives the order from those positions and decides whether the puzzle is solved. The phone never declares a win by itself.

**Fallbacks.** If the camera is blocked, missing, or the page is not on HTTPS, the player gets a clear message and a manual mode, and the server records a manual result as "manual". In dim light the app shows a lighting hint and, on phones that support it, a torch button.

**Shared room.** Every phone renders the same Blackout Protocol control room from one data template using three.js. The breaker lights, the terminal screen and the security door reflect the state the server sends, so all players see the facility come back to life together. Players look around by moving the phone (motion sensors) or by dragging, with a Recenter button.

**Phone care.** The camera is released whenever the scan screen closes or the page is hidden. The room stops rendering while hidden, caps its resolution, and recovers if the phone drops the graphics context. The layout is built for portrait phones down to 320 px wide.

**Why QR tags.** They are reliable on ordinary phones under hackathon time pressure: no machine-learning model, no GPU-heavy vision, no server-side image processing.

**Built with:** TypeScript, React 19, jsQR, three.js, Vite. No API keys or environment variables.

**Verification:** 34 unit tests and 12 browser tests pass in Chrome. The browser tests use a simulated camera and phone-sized screens. The real-phone checklist is in `ar/MANUAL_TEST.md`. **Not yet run on a real phone.**

## Run

From the repository root, use Node.js 22.12+ or 24.

- **Physical puzzle demo:** `npm ci`, then `npm run dev`. Open **Marker cards** (or `ar/print/tags.html`) and print the three tags at actual size.
- **Shared room demo:** `cd ar`, `npm install`, then `npm run dev`. Tap **Host a room**, then join from a second tab with the 4-letter code or the guest URL in the message. This uses same-browser sync only (see "Shared AR room").

Phones need HTTPS for the camera and motion sensors; a plain `http://` LAN address will not work. Desktop `localhost` counts as secure.

## Physical puzzle details

Select **Enable camera** and allow access. The app requests the rear camera without audio.

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
  source: 'camera',                     // or 'manual'
  heldForMs: 1200
}
```

Manual results have `markers: []`, `detectedIds: []` and `heldForMs: 0`.

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
| `ar` (`ar/index.ts`) | `PhysicalPuzzle` (loads its own scoped `PhysicalPuzzle.css`), `CameraScanSession`, `ScanSequence`, tag helpers, types | `react`, `jsqr` |
| `ar/room` (`ar/room/index.ts`) | `RoomScene`, `blackoutProtocol`, `LookControls`, `RoomSync`, `LocalSync`, room types | `three` |

**Required in the consuming app's `vite.config.ts`:** `resolve: { dedupe: ["react", "react-dom"] }`. Without it, files under `ar/` resolve a second copy of React and `PhysicalPuzzle` crashes with `Cannot read properties of null (reading 'useState')` (verified with an outside test build).

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
- the room view at 320 px: toolbar, paused rendering, WebGL context loss, iOS-safe form controls

Simulated tests do not replace the real-phone checklist in `ar/MANUAL_TEST.md`.

The printable SVGs (`ar/public/markers/`) and `ar/print/tags.html` are checked in. `qrcode` is a development dependency used to generate them and the test images; it is not shipped in the app bundle.

## Environment variables

None. The AR module uses no API keys or secrets. Camera images never leave the phone.
