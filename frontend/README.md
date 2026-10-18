# RoomShift: Blackout Protocol (game client)

Mobile-first React 19, TypeScript, Vite and Tailwind PWA. This is the game players open. It talks to the real RoomShift backend; the server decides every outcome.

## Run locally

```sh
npm ci
npm run dev -- --host           # local demo (see below)
npm test                        # unit tests against the real backend engine
npm run lint
npm run build && npm run verify:dist
npm run test:e2e                # Playwright; needs a local backend, see "Browser tests"
```

`predev` / `prebuild` run `scripts/prepare-assets.mjs`, which copies the detector models, QR markers, MediaPipe WASM and the **unmodified** Niantic XR Engine into ignored `public/` folders and writes `public/external/runtime-manifest.json` with SHA-256 hashes. `verify:dist` checks the built `dist/` (engine bytes unchanged, every model shard present, PWA files, credits, and that no demo engine or puzzle answers leaked into the production bundle).

## Client modes

| Mode | When | What |
|---|---|---|
| **live** | production builds; `VITE_GAME_CLIENT=live` in dev | HTTP to `VITE_API_ORIGIN` (default `https://roomshift.app.space`): `POST /api/game`, polling `GET /api/game/room/:code` every 1 s (500 ms in Puzzle 2), heartbeat every 5 s. The player token is kept in `localStorage` (`roomshift.session.v2`) so a reload keeps the seat and clue |
| **mock (local demo)** | `npm run dev` default | The real backend engine runs in the tab with bot teammates (`?bots=1..3`). A **BOT CLUES** chip shows the bots' clues so one person can play. Excluded from production builds |

Nothing falls back silently: if the backend is unreachable the app says RECONNECTING / OFFLINE.

## URL options

| Option | Effect |
|---|---|
| `?room=K7QX` | prefill the join code (the lobby's join QR uses this) |
| `?debug` | tester overlay: build SHA, runtime versions, connection, room version/phase, camera owner, detector and ms/frame, AR tracking and frame time, latest error. Never tokens, clues or camera images |
| `?detector=coco` (default) / `mediapipe` / `auto` | Puzzle 1 detector. `auto` tries MediaPipe, then COCO-SSD |
| `?bots=1..3` | local demo only: number of bots |

Other pages: `/diagnostics.html` (device capabilities, model load and one-frame detection test), `/licenses.html` (credits), `/markers/{book,cup,keys}.svg` (printable QR tags).

## Camera and AR

- One camera owner at a time. The facility (`src/facility/FacilityView.tsx`, lazy-loaded) replaces the mission screen while open; **SCAN OBJECTS** stops the XR Engine and releases its camera before the Puzzle 1 scanner mounts.
- Puzzle 1 uses `ar/PhysicalPuzzle` with `serverJudged`: COCO-SSD (or MediaPipe) for BOOK and CUP, the printed QR tag for **KEYS** (no model has a keys class), QR backup for all three, and a manual report that the server still checks. Evidence sent: object positions and hold time, never images.
- The facility shows "AR · WORLD TRACKING" only while the XR Engine tracks; otherwise "3D PREVIEW · NOT AR". Floor height is a manual estimate from the typed camera height. Its breaker, terminal and exit follow `room.systems` from the server.
- Camera and motion need HTTPS (localhost is fine in development).

## PWA

- `public/manifest.webmanifest` defines the installable app and PNG icons (separate `any` and `maskable`).
- `public/sw.js` is registered for production builds. It precaches the app shell and serves it when offline; game state always needs the network.
- On iOS, use Safari's Add to Home Screen (the home screen shows a hint).

## Structure

- `../shared/`: canonical game types, events and constants (`@shared/*`), also used by the backend.
- `src/game/`: `GameClient` interface, `client.ts` (the client), `transport.ts` (HTTP), `engineServer.ts` + `mockTransport.ts` (local demo), `config.ts`, `content.ts` (role names, narration), `evidence.ts` (scanner result → server evidence), `useGame.ts`.
- `src/screens/`: one view per server phase (Home, Lobby, RoleReveal, Puzzle1, Puzzle2, FinalOverride, Transition, Complete, Failed = room lost).
- `src/ui/`: kit, mission header and clock, server error banner, join QR, shared boot draft and final-hold hooks.
- `src/facility/`: AR facility view and server-state mapping. `src/dev/`: debug overlay, local-demo panel. `src/diagnostics/`: tester page.
- `e2e/`: Playwright (two-player live mission, facility with an XR8 test double, real detector models). `tests/`: detector selection, opt-in live-backend test (`ROOMSHIFT_API=http://127.0.0.1:5199`).

## Browser tests

`npm run test:e2e` builds `dist-e2e` against `ROOMSHIFT_API` (default `http://127.0.0.1:5199`; do not point it at production without approval) and serves it on port 4173. Start a local backend first: `cd ../backend && npx deepspace dev start --port 5199 --host 127.0.0.1`. On a low-memory laptop run one spec at a time (`npx playwright test e2e/multiplayer.spec.ts`).

## Credits

The bundled MGS1 fonts by Andrew Gleeson are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); retain this credit when redistributing them.

The home title uses After Burner Neue by Damien Gosset. Keep its accompanying readme and specimen image in `src/assets/fonts/after-burner-neue/`; the author permits commercial and personal use but prohibits modifying or selling the font.

All runtime licenses: `/licenses.html` in the built app and [docs/LICENSES.md](../docs/LICENSES.md).
