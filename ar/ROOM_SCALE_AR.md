# Markerless, life-size AR room prototype

This is an **experimental WebXR room-scale** implementation in `feature/ar-room`, separate from the BOOK/CUP/KEYS QR puzzle on `feature/ar`.

## What it does
- Places a **3.4m × 3.4m × 2.5m** virtual Blackout Protocol laboratory on a detected real-world floor.
- Tracks the phone's position as you walk/look around a virtual room.
- Uses **no printed tracking markers** for the room.
- Provides a local 3D preview, room placement/move controls, and a simulated Restore Power action.
- Uses Three.js, the browser's WebXR immersive-AR session, and floor hit tests; not a full real-world scene mesh or physically safe collision boundary.
- Does **not** yet implement multiplayer synchronization, real QR puzzle integration, occlusion, object interaction or room persistence across browser sessions.

## Run locally
From repository root:

```powershell
git fetch origin
git switch feature/ar-room
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:5173/ar-room.html`. On a desktop, use **3D Preview** to inspect and orbit the life-size facility model. A desktop preview is not camera AR.

## Test on an Android phone
1. Use a phone that supports **ARCore**, with **Google Play Services for AR** installed, and the current Chrome browser.
2. Build with `npm.cmd run build`. Serve `dist/` through an HTTPS host such as Netlify Drop. The deployed URL should end in `/ar-room.html`.
3. Open the HTTPS page in Chrome on your phone. Tap **START AR** and grant camera access.
4. Aim the camera at a clear, well-lit floor, moving slightly as needed. When a green ring appears, tap **PLACE ROOM**, or tap the screen if the floating UI is unavailable.
5. Walk slowly *only in a physically clear space* to inspect stations, wall panels, room-scale height, and the control panel. No printed marker is required.
6. **MOVE ROOM** allows a new placement. **RESTORE POWER** toggles a local visual effect when the AR UI supports DOM overlay. This is not a multiplayer win.
7. Exit AR and verify the camera/session ends.

## iPhone limitation
Safari on iPhone currently does **not** provide the standard WebXR immersive-ar session used here. It may show the desktop-style 3D preview but **cannot launch the room-scale camera AR from this build**. A cross-platform world-tracking engine, such as the 8th Wall **distributed engine binary with SLAM** (not the MIT-only engine framework), or a native ARKit/ARCore app, is needed if iOS camera AR is a requirement. The 8th Wall binary has a separate limited-use license and attribution requirements.

## Troubleshooting
- **AR not supported**: check phone support for ARCore, Google Play Services for AR, browser and HTTPS. iOS Safari will not work.
- **Can't find floor**: aim at textured, evenly lit, flat flooring rather than reflective or featureless surfaces. Move slowly.
- **Buttons missing during AR**: the browser might not support `dom-overlay`; placing the room via a screen tap should still work. Other controls require the overlay.
- **Scene moves/drifts**: tracking can drift or fail in low light or repetitive spaces; reposition via **MOVE ROOM**.
- **Room blocks surroundings**: walls are deliberately semi-transparent, but they **do not** detect hazards, other people, or furniture. Keep the phone low enough to maintain situational awareness and don't walk into real obstacles.
- **Black desktop view**: 3D Preview must be visible; check devtools for CDN/network errors. Standalone module imports use jsDelivr and need internet access.

## Dependencies and architecture
`ar/public/ar-room.html` and `ar/public/ar-room.js` are copied into Vite's static build root as `/ar-room.html` and `/ar-room.js`. The standalone demo imports pinned Three.js modules from jsDelivr. It does not change the existing QR marker scanner, backend, or shared types.

## Testing status
GitHub code has been committed. **It has not yet been validated on a physical Android device or an iPhone**. Verify that floor hit testing, browser permissions, touch placement, and session cleanup work before presenting this as production-ready AR.
