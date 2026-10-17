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

## Design rules
- DeepSpace/shared backend owns mission truth.
- Vision returns verification results; it does not independently advance the whole game.
- Gemini never decides puzzle correctness.
- Photon is a delivery channel, not game state.
- Every optional integration has an in-app fallback.
