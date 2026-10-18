# RoomShift

**SwampHacks XII — October 16–18, 2026**

RoomShift is a cooperative mixed-reality puzzle game: players in the same room get different private clues on their phones, talk to each other, and arrange real objects to restore power to a virtual facility. The server decides every outcome.

## Mission: Blackout Protocol

1. One player creates a room; the others join by code or QR.
2. Each phone gets a role and a private clue fragment.
3. **Puzzle 1:** the team lines up a real BOOK, CUP and KEYS on a table. A phone camera checks the order and sends the evidence; the server verifies it and the breaker comes back on.
4. **Puzzle 2:** new clues; the team builds the terminal boot order together on their phones.
5. **Final override:** everyone holds ACTIVATE at the same time. The server opens the door and every phone shows POWER RESTORED.

At any point a player can open the facility: a world-tracked 3D research station placed on the real floor (iPhone Safari), or a labelled 3D preview where AR is unavailable. Its breaker, terminal and exit follow the server's state.

## What is in this repository

| Folder | What | Docs |
|---|---|---|
| `frontend/` | **The game** (React 19, TypeScript, Vite, Tailwind, installable PWA). Talks to the real backend; a local demo with bots exists for development only | [frontend/README.md](frontend/README.md) |
| `backend/` | DeepSpace app on Cloudflare Workers: the authoritative game engine (`POST /api/game`, `GET /api/game/room/:code`), rooms in a Durable Object, Gemini narration with static fallbacks | [docs/game-api.md](docs/game-api.md) |
| `ar/` | Camera and AR module used by the game: the Puzzle 1 scanner (COCO-SSD or MediaPipe for BOOK and CUP, QR tags for KEYS, QR backup, manual fallback) and the world-tracked facility (Niantic XR Engine + Three.js). Also the AR team's standalone demos | [ar/README.md](ar/README.md) |
| `shared/` | Canonical types, events and constants used by frontend and backend | |
| `prototypes/` | Early MediaPipe and Unity experiments, not used by the build | [prototypes/README.md](prototypes/README.md) |
| `docs/` | Architecture, API, test evidence, iPhone checklist, licenses | below |

## Run it

Node.js 22.12+ or 24.

```sh
cd frontend
npm ci
npm run dev          # local demo: in-tab copy of the real engine + bot teammates
VITE_GAME_CLIENT=live VITE_API_ORIGIN=https://roomshift.app.space npm run dev   # real backend
npm run build && npm run verify:dist   # production build, as Netlify runs it
```

Backend: `cd backend && npm ci && npx deepspace dev start` (needs a DeepSpace login). Phones need HTTPS for the camera and motion sensors.

## Status (be precise when demoing or writing Devpost)

| Feature | Status |
|---|---|
| Real multiplayer: create/join, private clues, all three puzzles, final hold, reset, rejoin after reload | Working against the real backend; tested with two browsers and two HTTP clients ([test results](docs/INTEGRATION_TEST_RESULTS.md)) |
| Puzzle 1 camera evidence verified by the server | Working on desktop with real models on photos. **KEYS is recognized only by its printed QR tag**; neither model has a keys class |
| MediaPipe (EfficientDet-Lite0) | Integrated, opt-in (`?detector=mediapipe`). Default stays COCO-SSD, which was more accurate in our tests |
| World-tracked facility | Built on the unmodified Niantic XR Engine 1.0.0; tested on desktop with an XR8 test double. **Not yet verified on an iPhone** |
| Real iPhone | **NOT DEVICE-VERIFIED** — see [docs/IPHONE_FINAL_ACCEPTANCE.md](docs/IPHONE_FINAL_ACCEPTANCE.md) |
| Deployment | Game: Netlify (`netlify.toml`, base `frontend/`). Backend: `https://roomshift.app.space`. This branch has **not** been deployed yet |
| Photon Mission Relay | Not implemented (clues are in the app) |

## Docs

- [docs/architecture.md](docs/architecture.md), [docs/game-flow.md](docs/game-flow.md), [docs/game-api.md](docs/game-api.md)
- [docs/AR_UNIFIED_DEPLOY.md](docs/AR_UNIFIED_DEPLOY.md): build and deploy
- [docs/INTEGRATION_TEST_RESULTS.md](docs/INTEGRATION_TEST_RESULTS.md): what was tested and how
- [docs/IPHONE_FINAL_ACCEPTANCE.md](docs/IPHONE_FINAL_ACCEPTANCE.md): real-device checklist
- [docs/LICENSES.md](docs/LICENSES.md): dependency, model, font and 3D-asset licenses
- [CLAUDE.md](CLAUDE.md): engineering context

## Team

- **Jenil Patel** — Project Lead / Integration / AI / Deployment
- **Reagan Crockett** — Front End / UI / React / UX
- **Ryan Ngo** — Front End / UI / Testing
- **Andel Budinich** — AR / Asset Creation / Game Experience

## Project rules

- The project started after the official SwampHacks XII hacking window began.
- Never commit API keys or secrets (`.env` is ignored; only `.env.example` is committed). The game client needs no secrets.
- Prefer reliability and a complete 2–3 minute judging demo over feature count.
