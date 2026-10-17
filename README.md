# RoomShift

**SwampHacks XII — October 16–18, 2026**

RoomShift is a cooperative AR-vision puzzle game where players in the same physical space receive different clues, communicate, and manipulate real-world objects to progress through a shared digital mission.

## MVP: Blackout Protocol

Players must restore power to a locked-down research facility before the timer expires.

Core loop:
1. Create or join a multiplayer room.
2. Receive asymmetric player roles and private clues.
3. Solve a physical object-arrangement puzzle using AR/vision verification.
4. Complete a synchronized cooperative puzzle.
5. Assemble the final override code.
6. All players activate the override together to win.

## Planned Stack

- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Realtime / backend:** DeepSpace
- **AR / Vision:** browser camera + marker/object tracking (AR.js / MediaPipe or simplest reliable approach)
- **AI:** Gemini for optional narrative enhancement
- **Mission Relay:** Photon Spectrum for optional private clue delivery
- **Deployment:** HTTPS web deployment suitable for mobile camera access

## Team

- **Jenil Patel** — Project Lead / Integration / AI / Deployment
- **UF CS sophomore #1** — Full-Stack / DeepSpace / Multiplayer
- **UF CS sophomore #2** — AR / Vision Developer (learning role)
- **Optional 4th member** — Frontend / UI / Game Experience

## Priority

**P0:** playable multiplayer mission + physical interaction + mobile UI  
**P1:** polished UX + Gemini + Photon Mission Relay  
**P2:** advanced vision / extra puzzles only if the MVP is stable

## Project Rules

- The project started after the official SwampHacks XII hacking window began.
- Never commit API keys or secrets.
- Prefer reliability and a complete 2–3 minute judging demo over feature count.

See [`CLAUDE.md`](CLAUDE.md) for engineering context and [`docs/game-flow.md`](docs/game-flow.md) for the game flow.
