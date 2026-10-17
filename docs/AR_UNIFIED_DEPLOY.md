# RoomShift unified iPhone AR — build and deployment

This is a **single repository branch and a single HTTPS host**, with two
entry points:
- `/`: AI object scanner (TensorFlow.js COCO-SSD BOOK/CUP and QR for KEYS,
  QR-only backup, manual fallback).
- `/ar-room.html`: experimental world-tracked life-size virtual facility
  using Niantic 8th Wall and Three.js; manual floor calibration, power toggle.

The pages link to each other. The AR room and scanner are not yet unified
into a single camera session and **the room is not synchronized to multiplayer**.

## Existing HTTPS address
https://remarkable-taffy-417014.netlify.app/ar-room.html

This is an existing hostname, NOT verification that the new branch is deployed
there. To update it, connect Netlify to GitHub or publish this branch's `dist`.

## Recommended Netlify Git-based build
1. Netlify > site `remarkable-taffy-417014` > Build & deploy > Continuous
   deployment. Connect repo `Jenil005/roomshift`.
2. Set production branch `feature/ar-unified`, base directory repository
   root, command `npm run build && npm run check:room-runtime`, publish `dist`.
   This branch includes `netlify.toml` with equivalent build settings.
3. Node version 22. The `prebuild` step generates ignored
   `ar/public/external/three` and `ar/public/external/xr` from npm
   dependencies; Vite copies them into `dist/external`.
4. After deployment confirm HTTP 200 at:
   `/external/three/build/three.module.js`,
   `/external/three/build/three.core.js`,
   `/external/three/addons/controls/OrbitControls.js`,
   `/external/xr/xr.js`, `/external/xr/xr-slam.js`, and
   `/models/coco-ssd/ssdlite_mobilenet_v2/model.json`.
   Do not use an SPA rewrite that serves HTML instead of missing files.
5. Open the page directly in iPhone Safari over HTTPS. Validate rear camera,
   motion permission, room tracking, measured floor calibration, and drift.
   No physical iPhone test has been performed through this integration.

## Local Windows verification
```powershell
git switch feature/ar-unified
npm.cmd ci
npm.cmd run build
npm.cmd run check:room-runtime
npm.cmd test
npm.cmd run test:ar
```

## MediaPipe and the keys limitation
This branch preserves the AR agent's working TensorFlow.js detector and
the QR backup, including hybrid AI/QR operation. COCO-SSD does NOT recognize
keys. PR #14 offers a standalone MediaPipe prototype, not yet integrated
into the RoomShift scanner and not a trained KEYS detector. It should not
replace the existing working scanner. To support all three objects without
QR, train or acquire a compatible keys model, implement the ObjectDetector
adapter (MediaPipe Tasks Vision is one option), and physically test it.

Do not delete the source branches until build, deploy, and iPhone testing pass.
