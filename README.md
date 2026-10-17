# RoomShift

**SwampHacks XII — October 16–18, 2026**

RoomShift is a cooperative AR-vision puzzle game where players in the same physical space receive different clues, communicate, and manipulate real-world objects to progress through a shared digital mission.

## Implemented: AR physical puzzle

A runnable React/TypeScript AR prototype in `ar/` now implements the first physical-order puzzle: camera-based QR marker detection, live overlays, stable order verification, printable marker cards, and a clearly labeled manual fallback. It runs locally on one device; multiplayer rooms and later mission phases remain planned.

```sh
npm ci
npm run dev
```

Use Node.js 22.12+ or 24. Select **Marker cards** in the app to print the BOOK, CUP, and KEYS markers. Mobile camera use requires HTTPS. See [AR usage and integration](ar/README.md) for setup, backend integration, and camera troubleshooting.

Validation: `npm test`, `npm run build`, and `npm run test:browser`.

## MVP: Blackout Protocol

Players must restore power to a locked-down research facility before the timer expires.

Core loop:
1. Create or join a multiplayer room.
2. Receive asymmetric player roles and private clues.
3. Solve a physical object-arrangement puzzle using AR/vision verification.
4. Complete a synchronized cooperative puzzle.
5. Assemble the final override code.
6. All players activate the override together to win.

## Stack and planned services

- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Realtime / backend:** DeepSpace
- **AR / Vision:** browser camera + marker/object tracking (AR.js / MediaPipe or simplest reliable approach)
- **AI:** Gemini for optional narrative enhancement
- **Mission Relay:** Photon Spectrum for optional private clue delivery
- **Deployment:** HTTPS web deployment suitable for mobile camera access

## Team

- **Jenil Patel** — Project Lead / Integration / AI / Deployment
- **Reagan Crockett** — Front End / UI / React / UX
- **Ryan Ngo** — Front End / UI / Testing 
- **Andel Budinich** — AR / Asset Creation / Game Experience

## Priority

**P0:** playable multiplayer mission + physical interaction + mobile UI  
**P1:** polished UX + Gemini + Photon Mission Relay  
**P2:** advanced vision / extra puzzles only if the MVP is stable

## Project Rules

- The project started after the official SwampHacks XII hacking window began.
- Never commit API keys or secrets.
- Prefer reliability and a complete 2–3 minute judging demo over feature count.

See [`CLAUDE.md`](CLAUDE.md) for engineering context and [`docs/game-flow.md`](docs/game-flow.md) for the game flow.
