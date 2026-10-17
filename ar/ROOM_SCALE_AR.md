# Issue #6: iPhone markerless facility prototype

**Status: implemented, automated checks only. Physical iPhone validation has not been performed.** The target supplied by the tester is **iPhone 18 Pro / iOS 27.0.1 / Safari**. This target is not a claim that that device/browser combination has been verified. Record results in [IPHONE_TEST_RESULTS.md](IPHONE_TEST_RESULTS.md).

The implementation is on `feature/ar-ios`, at `/ar-room.html`. The existing QR puzzle at `/` is unchanged and remains a separate experience. No printed markers are used by the facility.

## Tracking and scene design

- Uses the official **`@8thwall/engine-binary@1.0.0`**, including its proprietary **SLAM** chunk. It does not substitute the MIT engine framework, which lacks SLAM, and it does not call `navigator.xr` or request an immersive WebXR session.
- Uses the documented `GlTextureRenderer`, `Threejs`, and `XrController` camera pipeline modules. `XrController` is explicitly configured with `disableWorldTracking: false`, `scale: 'absolute'`, no image targets, and an unmirrored view. `XR8.run` uses the rear camera and the `MOBILE` device class.
- The original facility geometry from `ar/public/ar-room.js` has been extracted to `ar/public/room/facility.js`: the nominal **3.4 m × 3.4 m × 2.5 m** layout, open entrance, translucent walls, three consoles, and core panel are preserved. The room group stays at scale `[1, 1, 1]`. Small beam thicknesses extend beyond the nominal centerline footprint.
- Absolute-scale tracking estimates camera height and the ground at `y = 0`. A ray through the crosshair intersects that estimated plane. Placement requires normal tracking for at least one second, a stable projected pose for 600 ms, and a candidate within 0.5–8 m of the camera. The green outline previews the full nominal footprint; it is not proof that the physical area is clear.
- **Place Room** stores a world-space room transform with the open entrance facing the user. Subsequent camera poses do not move the room. Physical walking is expected to produce parallax through the engine's 6DoF pose; this still requires validation on the target phone.
- **Reposition** clears the placement and local power state so another world transform can be selected. It does not recenter the tracking origin, which would move existing content unexpectedly.
- **Restore Power** changes the core panel locally. It emits `roomshift:facility-power` with `{ powered, source: '8thwall' | 'preview', localOnly: true }`. No backend state, room victory, or multiplayer event is sent.
- Limited or stale tracking hides the facility and disables placement/power. Stop, backgrounding Safari, page exit, permission failure, and graphics interruption stop the engine and release available camera tracks. Starting again requires a fresh placement. Motion permission is requested from the Start button's user gesture, before asynchronous startup work.

## Install and run

Use the existing checkout; Node.js 22.12+ or 24 is required.

```sh
npm ci
npm run dev
```

The `predev` and `prebuild` hooks run `ar/scripts/prepare-room-runtime.mjs`. This copies the complete, pinned 8th Wall `dist/` directory **without modifying its contents**, its license files, and the pinned Three.js modules into ignored `ar/public/vendor/`. Generated binaries are not committed. The lockfile records npm integrity information; normal package integrity and TLS checks remain enabled.

Open the server's `/ar-room.html` path. A desktop can inspect **3D Preview**, which is explicitly labeled **not AR**. It does not demonstrate Safari camera, motion, scale estimation, or SLAM. Loading the engine alone does not request the camera.

The model, tracking controller, engine loader, attribution page, and browser tests are all under `ar/`. Root package scripts and dependency declarations only support installing, serving, building, and testing this additional route. The QR puzzle source and tests, backend, and shared files are unchanged.

## HTTPS deployment for the phone

1. Run `npm ci`, `npm run build`, and `npm run check:room-runtime`.
2. Deploy the **entire `dist/` directory**, including `vendor/8thwall`, `vendor/three`, `room/`, marker assets, both HTML entry points, and attribution files, to a static HTTPS host such as Netlify, Cloudflare Pages, or GitHub Pages. The host must serve the files as files, not rewrite runtime JS or license URLs to `index.html`.
3. Open the deployed `/ar-room.html` path directly in Safari on the phone. A trusted HTTPS certificate is required. Plain HTTP at a laptop's LAN IP and certificates Safari does not trust are unsuitable.
4. Verify `vendor/8thwall/xr.js`, `vendor/8thwall/xr-slam.js`, `vendor/8thwall/LICENSE`, and `vendor/three/three.module.js` return their actual files. JavaScript must have a JavaScript MIME type. The facility uses relative module/asset URLs and can be served in a subdirectory.
5. Alternatively, serve the completed `dist/` with `npm run preview` and forward that server through an HTTPS tunnel such as the ngrok workflow in the official documentation. For Vite development/preview host checking, allow **only your actual tunnel hostname**, for example by setting `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` before starting Vite. Do not disable host checks globally. No tunnel or cloud deployment has been created by this task.
6. Use compression for JS and ordinary caching. Avoid stale mixed runtime versions: deploy the entire folder together. The copied distribution is approximately 32 MB uncompressed; the facility loads `xr.js` and `xr-slam.js`, not the optional face-effects chunk/models. There is no CDN or account key required by this standalone configuration.

If a host supplies a restrictive Content Security Policy, it must permit the selected runtime's WebAssembly and worker execution; test that policy on Safari instead of stripping security checks or modifying the binary. This prototype does not add a CSP. Keep the page top-level rather than embedding it in an iframe. Do not set a Permissions-Policy that blocks camera or motion sensors. Microphone access is not required.

## Physical iPhone acceptance procedure

Use **iPhone 18 Pro, iOS 27.0.1, Safari** and record the exact deployed URL/build in [the test record](IPHONE_TEST_RESULTS.md). A 3D preview, emulator, simulated camera, or Android result cannot mark these checks passed.

1. **Cold start and permissions:** open the HTTPS route in a fresh Safari tab. Confirm the page identifies preview mode and does not open the camera automatically. Tap Start AR and grant Motion & Orientation and Camera permissions. Confirm a live rear-camera image appears.
2. **Initialization and scale:** use a well-lit, textured floor and a physically clear area larger than the facility. Move the phone gently to establish tracking/scale. Aim downward and confirm the green estimated footprint appears and Place Room enables only after a stable hold. Using a tape measure or known floor measurements (not tracking markers), compare the virtual 3.4 m width/depth and 2.5 m height. Record observed scale error; it is not guaranteed by setting `scale: 'absolute'` alone.
3. **Placement/orientation:** place the room. Confirm the entrance faces the starting viewpoint, the room is upright, and the base aligns reasonably with the floor. Look up/down and rotate the phone; the room must not behave like a screen overlay.
4. **Physical 6DoF movement:** walk slowly sideways, toward/away from the entrance, and around the virtual facility while remaining in clear real space. Verify parallax and that the room stays at its original physical location. Record drift after a loop and after at least 60 seconds. Measure against known real positions where practical.
5. **Interaction:** activate Restore Power. Verify the core label/material changes and the UI identifies a local effect. Toggle blackout and confirm the interaction remains local.
6. **Reposition:** select Reposition and place the facility elsewhere. Confirm the old placement disappears, power resets, and there is only one facility.
7. **Tracking loss:** point toward an untextured area or briefly cover the camera while stationary. Verify placement/power pauses and virtual content hides. Uncover and reacquire the scene; verify recovery, alignment, and whether repositioning is needed. Do not walk while tracking is lost.
8. **Lifecycle:** background Safari or lock the phone, return, and confirm the session remains stopped with the old placement cleared. Restart, place again, stop explicitly, and verify Safari's camera indicator turns off. Try portrait/landscape changes and expanding/collapsing browser chrome.
9. **Denied permissions:** test denied motion and camera permissions separately. Confirm an actionable message and recovery after changing Safari permissions/reloading. A successful desktop mock is not a pass for this step.
10. **Phone load:** run a few minutes. Record frame stability, heat/battery observations, glare/lighting conditions, any motion-to-render lag, and failures. Repeat after a reload. Do not present the feature as iPhone-tested until results are recorded.

## Limitations

- **Physical iPhone success is unverified.** The engine's compatibility check is only an estimate. iOS 27.0.1, this camera hardware, permission behavior, and rendering must be checked on the named phone.
- Ground position and metric scale are inferred, not a measured room reconstruction. A normal tracking status is not a guarantee of metric accuracy. Glossy or blank floors, weak lighting, fast movement, sensor availability, and thermal load can affect tracking/scale.
- No room mesh, real-object occlusion, collision boundary, obstacle recognition, or furniture detection is provided. Virtual walls cannot establish where it is safe to walk. The facility retains its open entrance and translucent walls to preserve some camera visibility.
- Drift or relocalization changes may require repositioning. No persistent anchors, VPS, cross-device alignment, or session restoration is implemented.
- Power is local only. Multiplayer integration, authoritative win state, and QR puzzle integration are deliberately separate.

## Licensing and attribution

The 8th Wall binary is licensed under the **XR Engine License Agreement**, not MIT. The complete original engine distribution and its notices are copied unmodified. Its full license and package license are served alongside the engine; the page includes visible creator/copyright attribution, a license link, and the AS-IS warranty disclaimer. [The attribution page](public/room-attribution.html) also includes the Three.js MIT notice. No sponsorship or endorsement is claimed.

The engine agreement permits installation/execution and distribution in original form as part of applications subject to its terms. It restricts engine modification/reverse engineering, competitive products, and certain paid products whose value derives entirely or substantially from engine functionality. Review the full agreement before changing the use or distribution model. The official FAQ is useful context but does not replace the license.

## Official references consulted

Documentation source snapshot: `8thwall/8thwall.github.io` commit `1cdf08391d7c732d0bee1c4ba34d252ea098951d`, read through the official GitHub repository because this environment blocks direct access to `8thwall.org`.

- [Distributed engine repository, installation, and license](https://github.com/8thwall/engine)
- [Engine loading and Three.js pipeline](https://8thwall.org/docs/engine/overview)
- [Absolute scale and world tracking configuration](https://8thwall.org/docs/api/engine/xrcontroller/configure)
- [Tracking status / XrController pipeline](https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule)
- [Three.js scene and camera integration](https://8thwall.org/docs/api/engine/threejs/pipelinemodule)
- [XR8.run device classes and rear-camera requirements](https://8thwall.org/docs/api/engine/xr8/run)
- [XR8.stop camera/motion lifecycle](https://8thwall.org/docs/api/engine/xr8/stop)
- [Binary versus MIT framework and attribution](https://8thwall.org/docs/open-source)
- [Permitted-use FAQ](https://8thwall.org/docs/migration/faq#distributed-engine-binary-license-and-permitted-use)

## Automated validation

```sh
npm run build
npm run check:room-runtime
npm test
npm run test:browser
```

Unit tests exercise projection, orientation, placement stability, loss/staleness, and independent world transforms. Chromium tests load the **real** distributed binary and SLAM chunk, then separately use an explicitly simulated XR8 contract to test application placement, movement, power, repositioning, permissions, and cleanup. The simulated contract does not implement or validate SLAM. Existing QR tests still run unchanged.
