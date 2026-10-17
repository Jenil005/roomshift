# RoomShift: Blackout Protocol

Mobile-first React, TypeScript, Vite, and Tailwind frontend for the cooperative facility puzzle demo.

## Run locally

```sh
npm install
npm run dev -- --host
```

The default client is a **local simulation** with bot teammates (same rules as the server, bots read their clues out loud). It does not connect real players. The marker scanner is a placeholder; Puzzle 1 has a manual fallback.

## Play with real players (backend)

```sh
npm run dev:live
```

This uses `src/game/deepspaceClient.ts`, which talks to the backend game API (`docs/game-api.md`). The dev server proxies `/api` to the deployed backend at `https://roomshift.app.space`; set `API_PROXY_TARGET` in `.env.live.local` to use a local `deepspace dev` instead. Open the printed `https://` Network URL on each phone, create a room on one, join with the code on the others. The dev server uses a self-signed certificate (`DEV_HTTPS=true` in `.env.live`) because phones only allow the camera over HTTPS: accept the browser's "not private" warning once per phone.

- Types: screens use the view model in `src/shared/types.ts`; ids, phases, constants and the puzzle 2 generator come from the shared contract in `../shared` (imported as `@shared`, same as the backend).
- Deploying the frontend separately: `npm run build:live` with `VITE_API_URL=https://roomshift.app.space` (the backend allows cross-origin `/api` calls).
- A refreshed phone rejoins its seat (token in localStorage). The LIFE bar is the server's mission clock (`room.timer`); when it runs out every phone shows GAME OVER.

## PWA

- `public/manifest.webmanifest` defines the installable app and PNG icons.
- `public/sw.js` is registered for production builds. It precaches the generated app JavaScript, styles, and local fonts, then serves the cached shell when offline.
- Browser install prompts appear only when supported. On iOS, use the browser's Add to Home Screen action.
- Camera scanning needs HTTPS in deployment; localhost is supported during development. Permission denial and unsupported browsers have a manual path.
- Offline play is explicitly a local bot demo; room state is not synchronized or verified by a backend.

Build with `npm run build`; serve the output from `dist/` over HTTPS to use installation and camera access on phones.

## Demo URL options

- `?dev` adds a DEV button (bottom left): pause/resume the clock, set 10 s / 1 min left, +1 min, clear the current stage, instant win, instant fail, reset, and jump to any stage. Works in the mock and live; live, it only shows for the room host.
- `?demo` uses the three-minute mission clock (live: on rooms created from that page).
- `?bots=1` plays with one bot; the default adds two.
- `?room=K7QX` prefills a four-character room code.

## Structure

- `src/shared/types.ts`: game phases, state, and action contracts.
- `src/game/`: client interface, local simulation, content, and AR seam.
- `src/screens/`: one view for each game phase.
- `src/ui/`: shared controls, camera view, and mission indicators.

The bundled MGS1 fonts by Andrew Gleeson are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); retain this credit when redistributing them.

The home title uses After Burner Neue by Damien Gosset. Keep its accompanying readme and specimen image in `src/assets/fonts/after-burner-neue/`; the author permits commercial and personal use but prohibits modifying or selling the font.
