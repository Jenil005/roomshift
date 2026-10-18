# RoomShift Architecture

```text
Player Phones
     │
     ▼
React + TypeScript UI
     │
     ├──────────────► AR / Vision Module
     │                 │
     │                 └─ verifies physical interaction
     │
     ▼
DeepSpace / authoritative shared game state
     │
     ├──────────────► Gemini (optional narrative enhancement)
     │
     └──────────────► Photon Spectrum (optional private Mission Relay)
```

## As built (feature/full-integration)

- **Game client:** `frontend/` PWA on Netlify, cross-origin HTTP to the backend (polling + heartbeat), token in `localStorage`.
- **Backend:** `backend/` DeepSpace app (`https://roomshift.app.space`), one Durable Object per room, pure `reduce()` engine; all puzzle checks happen here.
- **AR / vision:** `ar/` module inside the game: Puzzle 1 scanner (COCO-SSD default, MediaPipe optional, QR for KEYS) and the world-tracked facility (Niantic XR Engine). One camera owner at a time.
- **Gemini:** narration on the backend with static fallbacks. **Photon:** not implemented; clues are in the app.
- **Contracts:** `shared/` types, events and constants used by both sides.

## Design rules
- DeepSpace/shared backend owns mission truth.
- Vision returns verification results; it does not independently advance the whole game.
- Gemini never decides puzzle correctness.
- Photon is a delivery channel, not game state.
- Every optional integration has an in-app fallback.
