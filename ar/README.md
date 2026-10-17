# RoomShift AR Room (Blackout Protocol)

A shared virtual room, not a live camera view. Both devices build the same room from one
template (`templates/blackoutProtocol.ts`) and render the same synced state. A phone acts as a
window: move it (gyro) or drag to look around.

## Run
1. `cd ar && npm install && npm run dev`
2. Open the printed URL, tap **Host a room**.
3. Open the guest URL (shown in the toast and console) in a second tab. Both tabs show the same room.
4. Tap the bobbing diamond: breaker, then terminal, then door. The orb is the other player's view direction.

## Architecture
1. `templates/` pure-data room definitions (add a template per mission)
2. `room/RoomScene.ts` three.js scene: `applyState(state)`, `setPeers(list)`, `onInteract(cb)`
3. `room/LookControls.ts` gyro and drag look (iOS needs HTTPS and a button tap)
4. `sync/RoomSync.ts` the only network interface the scene sees
5. `sync/LocalSync.ts` same-browser test sync (BroadcastChannel). Not for real phones
6. `sync/rules.ts` demo-only gating. Real rules belong in the DeepSpace backend

## Wiring DeepSpace (next step)
Write `DeepSpaceSync implements RoomSync`:
1. `onState`: subscribe to the room's `RoomState` record
2. `interact`: send a request to the backend; the server validates and updates state
3. `sendPresence` / `onPeers`: map to DeepSpace presence, throttled to ~10 Hz
4. Replace `new LocalSync(...)` in `demo/main.ts` (or the real app) with it

## Known limits
1. Typechecked and built, but not yet viewed on a real device. Expect to tune `TUNING` in `RoomScene.ts` (light brightness) on a phone
2. Phone motion needs HTTPS: DeepSpace's `*.app.space` deploy provides it
3. Room geometry is simple primitives; swap in a GLB model later if time allows
