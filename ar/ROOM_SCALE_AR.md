# iPhone Safari room-scale AR prototype (Issue #6)

**Physical iPhone validation: NOT PERFORMED.** This branch implements a candidate
pipeline, not a claim of working or production-ready iPhone AR. The acceptance
criteria requiring a real camera, metric scale, drift, and device performance
remain open until the device test below is recorded.

`feature/ar-ios` replaces the standalone room demo's WebXR controller. The
Android experiment remains on `feature/ar-room`; the QR puzzle remains separate
on `feature/ar`. `ar/PhysicalPuzzle.tsx`, QR detection, markers, and multiplayer
contracts are unchanged. Open `/ar-room.html`; `/` still opens the QR puzzle.

## Runtime and placement

- `@8thwall/engine-binary` **1.0.0**, the distributed binary containing SLAM,
  loads `xr.js` with `data-preload-chunks="slam"`, then awaits `loadChunk('slam')`.
  This is not the MIT-only `@8thwall/engine` framework, which lacks SLAM.
- Three.js **0.183.2** is shared with `XR8.Threejs`. Pipeline order is camera-feed
  renderer, Three.js, XrController, and the application module. XR8 owns the AR
  render loop, projection, and camera pose. No `navigator.xr` is required.
- `disableWorldTracking: false`, `scale: 'absolute'`, and the rear camera enable
  the documented metric world-tracking path. The facility has unit scale and its
  original 3.4 x 3.4 x 2.5 meter layout, open entrance, consoles, translucent
  walls, and no opaque floor. Structural trim extends slightly beyond the nominal
  layout. `facility.js` reuses the previous `ar-room.js` geometry and adds a power strip.
- **Manual floor calibration, not detected planes:** the documented hit-test API
  supports feature points, which are not guaranteed floor points. After normal
  tracking has been reported continuously for 1.5 seconds, hold the rear camera
  at a measured height above the floor, enter that height, and tap CALIBRATE FLOOR.
  The application fixes `floorY = camera.position.y - measuredHeight`. Aim down:
  the center-view ray intersects that horizontal plane and previews the footprint.
  Tap PLACE ROOM to fix the transform; the open +Z entrance faces the user.
  Only the tracked camera moves thereafter. No marker, QR card, or USDZ is used.
- Height calibration does not prove metric scale has converged. Move the phone
  laterally while initializing and verify against a tape measure on a real phone.
  The floor stays horizontal; stairs and sloping floors are not supported.
- MOVE ROOM clears the placement, floor calibration, and local power state.
  RESTORE POWER changes the core label and emissive power strip locally. It never
  declares a multiplayer mission win or sends backend messages.
- Tracking loss hides the room and disables placement/power until tracking
  recovers. A stale-frame timeout stops the session. Recalibrate after drift.
  Exit, hidden page, page navigation, or fatal error calls `XR8.stop()` to close
  the camera. RELOAD AR deliberately starts a fresh page/SLAM session to avoid
  stale permission callbacks and retained engine state. 3D Preview is not AR.

## Build and HTTPS deployment

Use Node 22.12+ or 24, from the repository root:

```powershell
npm.cmd ci
npm.cmd run dev
# Desktop preview: http://localhost:5173/ar-room.html
npm.cmd run test:ar
npm.cmd test
npm.cmd run build
```

`predev` and `prebuild` run `scripts/prepare-ar.mjs`. This copies the complete,
unmodified engine `dist` (including SLAM resources/WASM and LICENSE) plus pinned
Three.js assets and its license into ignored `ar/public/external/`. Vite copies
that directory and the room HTML/JS into `dist/`. No account, app key, CDN at runtime,
or hosted 8th Wall editor is needed. Commit the package lock, not generated assets.
Do not minify, patch, reverse engineer, or substitute the distributed engine.

Deploy **all of `dist/`** to a static host with trusted HTTPS, at the domain root.
Open `https://YOUR-HOST/ar-room.html` directly in iPhone Safari, outside in-app
browsers. Serve `.js` as JavaScript and `.wasm` as `application/wasm`; missing
assets must return 404 rather than the SPA HTML. Keep the engine's relative resource
paths intact. Verify `/external/xr/xr.js`, `/external/xr/xr-slam.js`, every file
under `/external/xr/resources/`, and both license links are publicly accessible.
The complete engine is about 31 MB uncompressed; transfer depends on caching and
compression. Configure compression and cache static assets; invalidate the whole
engine directory together when upgrading. Avoid a restrictive Permissions-Policy
that disables camera, accelerometer, or gyroscope. A strict CSP must accommodate
this engine's WebAssembly/worker requirements and the page's import map/styles;
validate the actual deployed policy on the phone rather than relaxing it blindly.

For development use a trusted HTTPS tunnel to the Vite server, for example
`ngrok http 5173`. Configure only that tunnel's hostname with Vite's
`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable if necessary.
An HTTP LAN IP is insufficient; localhost on a laptop is not localhost on a phone.
No deployment has been performed as part of this implementation.

## Physical iPhone acceptance test (required, pending)

Use a well-lit area with a textured floor and at least a clear 3.4 x 3.4 m footprint
plus walking clearance. Virtual walls do not detect physical obstacles.

1. Record the exact build revision, HTTPS URL, iPhone model, iOS version, Safari
   version, lighting, floor texture, and orientation. Start with a fresh page.
2. Confirm 3D Preview is labeled NOT AR. Tap START AR; allow motion and camera.
   Confirm a live, unmirrored rear-camera feed fills the view. No audio permission
   and no printed markers should be needed.
3. Move slowly side to side until tracking initializes. Measure rear-camera height
   with a tape measure, enter it, and calibrate. Aim down, check the green 3.4 m
   footprint, and place explicitly. Verify the entrance faces you and geometry
   is upright. Measure apparent width/depth/height against real distances.
4. Walk slowly around and into the clear volume for at least 60 seconds. Record
   visible drift in centimeters relative to fixed physical reference points,
   scale error, jitter, clipping, frame rate/frame time, and thermal behavior.
   Confirm perspective changes with translation, not just phone rotation.
5. Rotate portrait/landscape before and after placing. Check camera aspect, scene
   projection, safe-area controls, calibration input, and license links.
6. Restore Power, verify core label/light, then simulate blackout. Confirm local
   status and absence of multiplayer completion. MOVE ROOM and place elsewhere;
   confirm old placement and power state clear.
7. Obscure the camera, try a plain/reflective area, and return to textured space.
   Verify tracking feedback and disabled actions; check recovery/recalibration.
8. Exit and confirm Safari's camera indicator turns off. Reload and start again.
   Repeat while backgrounding, locking, navigating away, and leaving during the
   camera permission dialog. A return must not silently reopen the camera.
9. Deny camera and motion separately, then recover through Safari settings/reload.
   Test missing engine assets, slow network, unsupported browser/WebGL, and HTTP.
   Errors must be understandable and 3D Preview must remain available.

| Evidence | Result |
| --- | --- |
| Test date / tester | Not performed |
| iPhone model / iOS / Safari | Not available in this environment |
| HTTPS URL / revision | Not deployed / pending |
| Permission / camera / exit | Pending physical device |
| Scale / walking / drift / placement | Pending physical device |
| Portrait / landscape / performance | Pending physical device |
| Power / reset / interruption recovery | Pending physical device |

Do not close the device acceptance criteria or present this as phone-validated
until this record contains actual observations. Desktop tests with mocked XR8
verify application behavior only, not SLAM, camera alignment, or iPhone support.

## Limitations and troubleshooting

Absolute scale and pose are estimates and can drift or relocalize. A normal
tracking status is not a precision guarantee. Calibration error affects floor
height; it does not correct engine scale. There is no scene mesh, physical
collision, occlusion, persistent anchor, shared map, VPS, or multiplayer. Avoid
low light, mirrors, blank walls, and rapid motion. Large downloads, older hardware,
thermal throttling, and future Safari changes may affect startup and performance.

If the engine fails to load, run `npm run prepare:ar` and inspect HTTP responses
for the entire runtime tree. If permissions fail, open directly in Safari over
HTTPS and check site camera/motion settings. If the footprint is missing, finish
calibration and aim downward within 0.4 to 8 m. For floating/sliding geometry,
stop moving, allow tracking recovery, and use MOVE ROOM with a measured height.

## Attribution and official references

XR Engine by **Niantic Spatial, Inc. Copyright (c) 2026 Niantic Spatial, Inc.
All rights reserved.** The binary is licensed under the
[XR Engine License Agreement](https://github.com/8thwall/engine/blob/main/LICENSE),
including its disclaimer of warranties: provided as is, without warranties.
The build retains the original binary notices and full license and exposes links
in the experience. Three.js is MIT licensed; its original LICENSE is also shipped.
This project is not endorsed by Niantic Spatial.

The binary license permits integration/distribution under its conditions and
restricts modification, reverse engineering, competitive engine development, and
certain paid products whose value derives substantially from the engine. Review
the full agreement for any changed commercialization or redistribution plan.

Official references consulted on 2026-10-17:

- [Engine loading and Three.js pipeline](https://8thwall.org/docs/engine/overview)
- [Official Three.js world-effects example](https://github.com/8thwall/threejs-world-effects-example)
- [Binary vs MIT framework and attribution](https://8thwall.org/docs/open-source)
- [Absolute scale configuration](https://8thwall.org/docs/api/engine/xrcontroller/configure)
- [Hit-test limitations](https://8thwall.org/docs/api/engine/xrcontroller/hittest)
- [Tracking status and camera pose](https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule)
- [Rear camera and mobile run options](https://8thwall.org/docs/api/engine/xr8/run)
- [Stop and release camera](https://8thwall.org/docs/api/engine/xr8/stop)

## Local validation record (2026-10-17)

- `npm run test:ar`: 3 placement/calibration math tests passed.
- `npm test`: all 15 existing QR decoding/order tests passed.
- `npm run test:browser`: all 16 tests passed in installed desktop Edge/Chromium
  (7 existing QR tests and 9 room tests). On Windows this run set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed `msedge.exe`.
- The real distributed binary and SLAM chunk loaded in the browser without page
  errors. Remaining room tests used an explicit XR8 test double to exercise
  metric configuration, placement, fixed room transforms, tracking loss, power,
  reset, portrait/landscape controls, errors, exit, backgrounding, motion denial,
  and stale permission callbacks. They do not demonstrate actual world tracking.
- `npm run build`: TypeScript and Vite production build passed.
- All 13 files in the binary's distribution matched the generated production
  copies byte-for-byte (SHA-256). Its bundled LICENSE is preserved; the original
  package-level license is also copied as `external/xr/LICENSE-package`.
- `git diff --check`: passed. QR implementation files were not edited.
- HTTPS deployment and physical iPhone tests: **not performed**. Device-dependent
  acceptance criteria remain pending; use the checklist above before release.
