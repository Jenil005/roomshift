# AR → Frontend integration request: AI scanner for puzzle 1

**From:** AR / Vision agent (`ar/**`). **To:** frontend owner (`frontend/**`, branch `feature/frontend`).
**Status:** the AR side is merged to `main` (PR #11) plus one compatibility fix on `feature/ar-agent` (see "Already done on the AR side"). Nothing in `frontend/**` has been changed by the AR agent.

Goal: puzzle 1 uses the AR module's `PhysicalPuzzle`. It scans with **AI first** (COCO-SSD recognizes BOOK and CUP; KEYS is read from its printed QR tag in the same frame), offers **QR backup** if the AI can't load, and keeps a **manual** fallback. The backend stays authoritative: the phone only sends evidence.

Everything below refers to `origin/feature/frontend` as of commit `29b93a7`. Requests 1–5 are required; 6–8 are recommended.

---

## 1. Add the dependencies (`frontend/package.json`)

```sh
cd frontend
npm install jsqr@^1.4.0 @tensorflow/tfjs-core@^4.22.0 @tensorflow/tfjs-converter@^4.22.0 \
  @tensorflow/tfjs-backend-webgl@^4.22.0 @tensorflow-models/coco-ssd@^2.2.3
```

| Package | Why | Loaded |
|---|---|---|
| `jsqr` | QR decoding (QR backup, and the KEYS tag in AI mode) | with the puzzle |
| `@tensorflow/tfjs-core`, `-converter`, `-backend-webgl` | on-device inference (WebGL) | only when AI scanner is shown |
| `@tensorflow-models/coco-ssd` | the object detector | only when AI scanner is shown |

All five are Apache-2.0. Use these modular TF packages, not the `@tensorflow/tfjs` umbrella package. They are installed in the consuming app because files under `ar/` resolve packages from the importing app.

`three` is **not** needed unless you also mount the 3D room view (`ar/room`).

## 2. Configure Vite (`frontend/vite.config.ts`)

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@ar": fileURLToPath(new URL("../ar", import.meta.url)) },
    // Required. Without it, files under ar/ load a second copy of React and PhysicalPuzzle
    // crashes with "Cannot read properties of null (reading 'useState')".
    dedupe: ["react", "react-dom"],
  },
  // ar/ is outside frontend/, so the dev server must be allowed to serve it.
  server: { fs: { allow: [".."] } },
});
```

For TypeScript, add to `frontend/tsconfig.app.json`: `"paths": { "@ar": ["../ar/index.ts"], "@ar/*": ["../ar/*"] }`. The `ar/` code already passes your strict flags (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`).

## 3. Serve the model files at `/models/coco-ssd/`

The AI scanner loads `<BASE_URL>models/coco-ssd/ssdlite_mobilenet_v2/model.json` and 5 weight shards (17.5 MB total) from the app itself. It never uses a CDN. The files live in `ar/public/models/coco-ssd/`.

Recommended: copy them at dev/build time instead of committing a second 17.5 MB copy.

`frontend/package.json` scripts:

```json
"sync:models": "node -e \"require('fs').cpSync('../ar/public/models', 'public/models', { recursive: true })\"",
"predev": "npm run sync:models",
"prebuild": "npm run sync:models"
```

and in `frontend/.gitignore`: `public/models/`

**Check:** after a build, `frontend/dist/models/coco-ssd/ssdlite_mobilenet_v2/model.json` exists, and on the deployed site `https://<host>/models/coco-ssd/ssdlite_mobilenet_v2/model.json` returns 200 (not your `index.html`). If the files are missing, the scanner says "The AI model could not be loaded" and offers QR backup. The game still works, but without AI.

## 4. Mount `PhysicalPuzzle` on the puzzle 1 screen (`frontend/src/screens/Puzzle1.tsx`)

Replace `<CameraView onResult={…} />` with the AR component. **Do not mount both.** `CameraView` opens the camera as soon as it mounts, without a tap, which breaks the iOS "camera only after a tap" rule and holds the camera that `PhysicalPuzzle` needs.

```tsx
import { useState } from "react";
import { PhysicalPuzzle, type PhysicalPuzzleResult as ArResult } from "@ar";

// inside Puzzle1(), replacing the CameraView block:
const [attempt, setAttempt] = useState(0);
const submitPhysical = (result: ArResult) => {
  send({ type: "puzzle:submit", puzzle: 1, result });
  // If the server rejects the attempt (state.lastError is set), remount for a fresh try:
  setTimeout(() => setAttempt((n) => n + 1), 1500);
};

{!manual ? (
  <>
    <PhysicalPuzzle key={attempt} onResult={submitPhysical} />
    <p className="ar-instruction m-0">Put the book, the cup and the keys (with its QR tag) in one row, then point the camera at them.</p>
  </>
) : ( /* your existing manual tap grid, unchanged */ )}
```

Notes:

- `onResult` fires **once** per mount, after the arrangement held steady for 1.2 s. Remount it (new `key`) for another attempt. If the server accepts, the phase changes and the screen unmounts anyway.
- `PhysicalPuzzle` has its own mode tabs: **AI scanner** (default), **QR backup** and **Manual demo**. You can keep your "Camera not working? Confirm manually" toggle. Switching to it unmounts `PhysicalPuzzle`, which releases the camera.
- It brings its own stylesheet, scoped to `.scanner-panel` (dark green Blackout Protocol look), so it does not restyle your app. Check that Tailwind's preflight doesn't visibly change it at 320–430 px wide. If it does, tell the AR agent rather than overriding `.scanner-panel` styles.
- `CameraView` and `arBridge.ts` can stay for now; nothing uses them once this is in. The synchronous `OrderScanner(video)` seam in `arBridge.ts` cannot fit the AR module, because the scanner is asynchronous and owns its camera session.

## 5. Accept the AR result shape and fix the id case

**Type** (`frontend/src/shared/types.ts`): the frontend's `PhysicalPuzzleResult` is `{ solved, detectedIds, order? }`. The AR result has more fields, and the backend needs them (`markers`, `source`, `heldForMs`):

```ts
{
  solved: true,
  markers: [{ id: "book", center: { x, y }, corners: [...] }, ...], // the server derives the order from these
  detectedIds: ["book", "cup", "keys"],
  order: ["book", "cup", "keys"],
  source: "camera" | "manual",
  heldForMs: 1200,
  evidence: { book: "ai", cup: "ai", keys: "qr" }, // how each object was observed
}
```

Re-export the AR type instead of keeping a copy: `export type { PhysicalPuzzleResult } from "@ar";`. Then `ClientAction`'s `puzzle:submit` carries the full result, unchanged.

**Id case** (`frontend/src/game/mockClient.ts`, line 142): AR ids are lowercase (`"book"`), and your `ObjectId` and `PUZZLE_1_SOLUTION` are uppercase. Today the mock would reject a correct AR solve. Compare case-insensitively:

```ts
const order = (action.result.order ?? []).map((id) => id.toUpperCase());
const ok = action.result.solved && JSON.stringify(order) === JSON.stringify(PUZZLE_1_SOLUTION);
```

(The real backend already lowercases ids.)

## 6. When `deepspaceClient.ts` is implemented: map puzzle 1 to the backend contract

The backend's `puzzle:submit` takes `submission.physical`, not `result`:

```ts
case "puzzle:submit":
  if (action.puzzle === 1)
    return gameRequest({ type: "puzzle:submit", submission: { roomCode: "", playerId: "", puzzle: 1, physical: action.result } }, session);
```

The server ignores the client's `solved`, `order` and `detectedIds`. It sorts `markers` by `center.x` itself and requires `heldForMs >= 1200`, so the phone never declares a win. Your manual tap grid should send `physical: { source: "manual", order }` (or `manualCode`, e.g. `"BCK"`). Don't send it as camera evidence. The backend's request schema currently strips the extra `evidence` fields. That's fine; nothing depends on them.

## 7. Recommended: cache the model in the service worker (`frontend/public/sw.js`)

`sw.js` runtime-caches only `/assets/`. The lazy TF.js chunks are covered by that, but the 17.5 MB model under `/models/` is not. Without caching it, iOS may re-download it, which is slow on venue Wi-Fi. Suggested change:

```js
const CACHE_NAME = 'roomshift-shell-v3' // bump so phones pick up the new worker
// in the fetch handler's cache-put condition:
const path = new URL(request.url).pathname
if (response.ok && (path.startsWith('/assets/') || path.startsWith('/models/'))) { … }
```

Don't precache the model on install. That would make every first visit download 17.5 MB even when nobody reaches puzzle 1.

## 8. Recommended: free the model after puzzle 1

The model stays loaded for the rest of the page, so a retry or mode switch is instant. When the phase leaves `PUZZLE_1`, free its GPU memory:

```ts
import { releaseCocoSsdDetector } from "@ar";
useEffect(() => { if (state?.phase !== "PUZZLE_1") releaseCocoSsdDetector(); }, [state?.phase]);
```

If you later add the 3D room view (`ar/room` `RoomScene`) on the same screen, pass `onScanningChange={(on) => on ? scene.stop() : scene.start()}` to `PhysicalPuzzle` so it doesn't render while the camera is scanning.

---

## How to check your integration

1. `npm run build` in `frontend/` passes (type check + Vite). `dist/models/coco-ssd/…` exists.
2. In desktop Chrome on `localhost`: the puzzle 1 screen shows the AI scanner. "INITIALIZING AI" changes to "CAMERA READY", and the camera opens only after **Start AI camera**.
3. DevTools → Network while AI scanner loads: `model.json` and 5 `group1-shard*` requests return 200 from your own host. Nothing goes to `storage.googleapis.com`.
4. Point at a book and a mug: boxes labelled with real scores, e.g. "BOOK 52%", "CUP 90%". KEYS reads "NEEDS QR TAG" until its printed tag (`ar/print/tags.html`) is visible. With BOOK → CUP → KEYS held steady, `onResult` fires once, and the mock advances to `PUZZLE_1_COMPLETE` (after request 5).
5. Tap **QR backup**, then **Manual demo**: the camera light turns off each time.
6. Block `/models/` in DevTools (Network request blocking) and reload: **Switch to QR backup** appears, and QR backup completes the puzzle with all three printed tags.
7. Real iPhone over HTTPS: `ar/MANUAL_TEST.md` section E.

## Already done on the AR side

- `PhysicalPuzzle` with AI scanner, QR backup and manual modes; evidence per object; self-hosted, lazy-loaded model; QR backup offered after a load failure or a 15 s timeout (PR #11, merged).
- Compatibility with your TypeScript settings: `ar/` no longer uses constructor parameter properties, so it passes `erasableSyntaxOnly` (commit on `feature/ar-agent`, see the AR report).
- Not verified: building `ar/` inside the frontend app itself (Vite 8, TypeScript 6). The AR tests run under the repo root's Vite 7 / TypeScript 5.9. Please report any build error to the AR agent instead of editing `ar/`.

Questions or problems: open them against `ar/**` for the AR agent. Details on the scanner: `ar/README.md`, "AI object detection" and "Frontend integration".
