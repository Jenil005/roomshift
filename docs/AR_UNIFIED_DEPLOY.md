# RoomShift build and deployment

One game, two hosts:

| Part | Host | Source | Deploy |
|---|---|---|---|
| Game PWA (scanner, facility, all screens) | Netlify site `remarkable-taffy-417014` → `https://remarkable-taffy-417014.netlify.app` | `frontend/` (imports `../ar`, `../shared`) | `netlify.toml` at the repository root |
| Game API + DeepSpace landing page | `https://roomshift.app.space` | `backend/` | `npx deepspace deploy` (DeepSpace CLI, logged in) |

The old two-page AR site (`/` scanner, `/ar-room.html` standalone facility) is **no longer published**: the scanner and the world-tracked facility now live inside the game and share one camera. Those pages still build at the repository root for the AR team (`npm run build` there).

> **Status:** `feature/full-integration` has **not** been deployed to either host. The URLs above are the existing sites, not proof that they run this branch. Check the build SHA in the `?debug` overlay after any deploy.

## Netlify (game)

`netlify.toml` already sets everything:

- base directory `frontend`, command `npm run build && npm run verify:dist`, publish `dist`, Node 22;
- `VITE_GAME_CLIENT=live`, `VITE_API_ORIGIN=https://roomshift.app.space` (no secrets: the API is public and token-based);
- **no SPA wildcard redirect**, so a missing JS, WASM or model file is a real 404 and never `index.html` with HTTP 200;
- `Permissions-Policy` allows camera and motion sensors for the site only; long caching for hashed `/assets/*`, revalidation for `index.html`, `sw.js` and the manifest.

Netlify clones the whole repository, so `frontend/` can import `../ar` and `../shared`. `npm ci` in `frontend/` installs everything the build needs (the root and `ar/` packages are not needed).

Two ways to deploy, both need the project lead's approval:

1. **Git-connected (recommended).** Netlify → site → Site configuration → Build & deploy → link `Jenil005/roomshift`. Deploy previews for pull requests come for free; set the production branch to `main` only once the PR is merged.
2. **CLI preview from this machine.** `npx netlify login`, then from the repository root `npx netlify deploy --build` (a draft URL, not production). Production needs `--prod`; do not run it without approval.

### After a deploy, check

```sh
curl -sI https://<host>/                                   # 200, text/html
curl -sI https://<host>/external/xr/xr.js                  # 200, JavaScript
curl -sI https://<host>/external/xr/xr-slam.js             # 200
curl -sI https://<host>/models/coco-ssd/ssdlite_mobilenet_v2/model.json   # 200, JSON
curl -sI https://<host>/models/mediapipe/efficientdet_lite0_fp16.tflite   # 200
curl -sI https://<host>/mediapipe/wasm/vision_wasm_internal.wasm          # 200, application/wasm
curl -sI https://<host>/does-not-exist.js                  # 404, not HTML
```

Then open `https://<host>/?debug` and confirm the build SHA, and `https://<host>/diagnostics.html` on a phone. The real-device test is [IPHONE_FINAL_ACCEPTANCE.md](IPHONE_FINAL_ACCEPTANCE.md).

## DeepSpace (backend)

```sh
cd backend
npm ci
npm run validate              # tsc + 63 unit tests
npm run build
npx deepspace dev start --port 5199 --host 127.0.0.1    # local server for the tests
node tests/sim/playthrough.mjs http://127.0.0.1:5199    # 47-step multiplayer simulation
npx deepspace deploy          # production; only with approval
```

The only backend change on this branch is the static landing page (`src/pages/index.tsx`, `src/seo.ts`, `src/constants.ts` `PLAY_URL`), which links to the Netlify game. The game API is unchanged, so the game works against the currently deployed backend.

## Local verification (Windows)

```powershell
cd frontend; npm.cmd ci; npm.cmd run lint; npm.cmd test; npm.cmd run build; npm.cmd run verify:dist
cd ..; npm.cmd ci; npm.cmd test; npm.cmd run build; npm.cmd run check:room-runtime
```

CI (`.github/workflows/ci.yml`) runs the same frontend, backend and AR checks on push and pull request.

## Detectors and the KEYS limitation

- Default detector: **COCO-SSD lite_mobilenet_v2** (TensorFlow.js, WebGL). Uses classes `book` and `cup`.
- Optional: **MediaPipe Tasks Vision 1.0.1** with **EfficientDet-Lite0 float16** (`?detector=mediapipe`, or `auto` = MediaPipe then COCO-SSD). Same two classes. Served from this site, no API key. In our tests it was weaker and slower than COCO-SSD on composite scenes, so it is not the default.
- **KEYS:** neither model has a keys class. KEYS is identified **only by its printed QR tag** (`/markers/keys.svg`). Recognizing real keys would need a custom-trained model behind the `ObjectDetector` interface, physically tested; none exists.
- Fallbacks: QR backup (tags on all three objects) and a manual report, which the server still checks and records as `verifiedBy: "manual"`.

## Licenses

The Niantic XR Engine is shipped **unmodified** with its license (`/external/xr/LICENSE`) and its SHA-256 recorded in `/external/runtime-manifest.json`; `verify:dist` and `check:room-runtime` fail if the bytes change. Every runtime credit is on `/licenses.html`; the full inventory is [LICENSES.md](LICENSES.md).
