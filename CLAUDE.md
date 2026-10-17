# RoomShift — Claude Engineering Context

## Mission
Build a polished SwampHacks XII MVP that proves this promise:

> RoomShift makes people and physical objects in the same room part of a cooperative digital adventure.

## Current Team
1. **Jenil Patel** — Project Lead / Integration. Own architecture, Claude orchestration, Gemini, deployment, Git integration, QA, demo, Devpost.
2. **UF CS sophomore #1** — Full-Stack / DeepSpace. Own multiplayer rooms, authoritative game state, synchronization, reconnect behavior, backend integration.
3. **UF CS sophomore #2** — AR / Vision Developer, currently learning. Own browser camera, marker/object detection, physical puzzle verification, fallbacks.
4. Optional: Frontend/UI/Game Experience developer.

## MVP: Blackout Protocol

A 5–8 minute cooperative physical puzzle game with a 2–3 minute judge demo mode.

### Win flow
LOBBY → ROLE REVEAL → PUZZLE 1 → PUZZLE 2 → FINAL OVERRIDE → COMPLETE

### Puzzle 1 — Asymmetric object order
Use 2–3 objects on a table (example: book, cup, keys). Each player receives only part of the ordering logic. Players communicate and physically arrange the objects. AR/vision verifies the order.

### Puzzle 2 — Cooperative synchronized interaction
Two players must scan/activate assigned objects within a short time window while another player holds timing/instruction information. DeepSpace verifies the cooperative event.

### Final Override
Each player receives part of the final code. The team combines it, the physical arrangement is verified, then all players hold/press ACTIVATE within the synchronization window. The server declares victory and all devices transition to the mission-complete state.

## Architecture

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- mobile-first

### Realtime / backend
Use **DeepSpace** where practical for:
- session/room state
- connected players
- role assignment
- authoritative mission phase
- puzzle completion
- real-time updates

The backend is authoritative. Clients submit actions; clients do not declare themselves winners.

### AR / Vision
Use the simplest reliable browser-based method:
1. marker / QR / fiducial tracking preferred for MVP
2. relative X positions can validate physical order
3. MediaPipe / AR.js only when they improve reliability
4. arbitrary object recognition is not required

Expose a clean result to the game engine instead of coupling vision logic to UI.

Example conceptual interface:
```ts
export type PhysicalPuzzleResult = {
  solved: boolean;
  detectedIds: string[];
  order?: string[];
};
```

### Gemini
Gemini enhances narration only. It must not control critical game state or puzzle correctness. Keep static fallback narrative strings.

### Photon Mission Relay
Photon Spectrum is a P1 optional feature for delivering private role/clue messages through a real messaging channel. Every clue must also be available inside RoomShift as fallback. Photon is not the authoritative game-state system.

## Suggested Directory Ownership

- `frontend/**` — Jenil + full-stack teammate unless a 4th frontend teammate joins
- `backend/**` — full-stack / DeepSpace teammate
- `ar/**` — AR / Vision teammate
- `integrations/gemini/**` — Jenil
- `integrations/photon/**` — Jenil or delegated integration agent
- `shared/**` — changes require integration awareness
- `docs/**` — project lead / docs agent

## Claude Subagents

### Architect / Orchestrator
- maintain contracts and priorities
- decompose tasks
- prevent scope creep
- avoid editing every subsystem directly

### Frontend Agent
Own `frontend/**`.
Build mobile screens: create/join, lobby, role reveal, mission, puzzle state, timer, victory.

### Backend / DeepSpace Agent
Own `backend/**` and DeepSpace configuration.
Implement rooms, players, role assignment, mission state, synchronized events, reconnect where feasible.

### AR / Vision Agent
Own `ar/**`.
Implement camera permissions, marker/detection pipeline, order validation, and graceful fallback.

### Integration Agent
Own `integrations/**` with explicit scope per task.
Gemini first; Photon only after the core loop works.

### QA Agent
Prefer read-only review first. Report CRITICAL / HIGH / MEDIUM / LOW issues. Check type errors, state races, mobile issues, leaked secrets, broken fallbacks, and demo blockers.

### Docs Agent
Maintain README/Devpost notes but only claim features proven to work.

## Agent Rules
1. Stay within assigned folders unless explicitly authorized.
2. Read shared contracts before implementation.
3. Do not redesign architecture silently.
4. Never commit secrets.
5. Prefer simple solutions under hackathon time pressure.
6. Do not add dependencies without explaining their purpose.
7. Run available checks before marking a task complete.
8. List changed files and known issues.
9. Do not rewrite working code purely for style.
10. Optimize for the live judge demo.

## Definition of Done
Each agent completion should report:
- STATUS
- FILES CHANGED
- WHAT WORKS
- TESTS/CHECKS RUN
- KNOWN ISSUES
- ASSUMPTIONS
- INTEGRATION NOTES

## Git Strategy
Suggested branches:
- `main`
- `feature/frontend`
- `feature/backend`
- `feature/ar`
- `feature/integrations`

Keep `main` demoable. Prefer focused commits. Human reviews integration changes.

## Shared Game State
Recommended phases:
```text
LOBBY
READY
INTRO
PUZZLE_1
PUZZLE_1_COMPLETE
PUZZLE_2
PUZZLE_2_COMPLETE
FINAL_OVERRIDE
COMPLETE
```

Potential events/actions:
```text
room:create
room:join
room:leave
player:ready
game:start
role:assigned
puzzle:submit
puzzle:verified
game:advance
final:activate
game:complete
```
Names may change to match DeepSpace conventions; keep shared TypeScript types as the source of truth.

## Scope
### P0 — Must ship
- create/join room
- 2–3 players
- asymmetric role clues
- synchronized state
- one physical verified puzzle
- one cooperative puzzle
- final synchronized win sequence
- mobile UI
- HTTPS deployment
- resettable demo

### P1 — Strongly desired
- polished UI and audio feedback
- QR join
- Gemini narration + static fallback
- Photon Mission Relay + in-app fallback
- reconnect handling

### P2 — Only if stable
- richer object recognition
- additional missions
- more puzzles
- advanced AR overlays

## Failure Fallbacks
- Vision unreliable → use markers / QR sequence.
- Gemini unavailable → static narrative.
- Photon unavailable → show clue in app.
- Multiplayer unstable → reduce to 2 players before removing multiplayer.
- Time low → cut P1/P2 immediately.

## Judge Demo Target (2–3 minutes)
1. 0:00–0:20 — one-sentence pitch.
2. 0:20–0:40 — judge joins via code/QR.
3. 0:40–1:00 — different clues appear.
4. 1:00–1:30 — physical arrangement is solved and verified.
5. 1:30–1:50 — synchronized second/final action.
6. 1:50–2:10 — all devices show POWER RESTORED / MISSION COMPLETE.
7. Remaining time — explain DeepSpace, AR validation, Gemini/Photon if active.

## Hardware Constraints
Jenil's laptop: i7-6500U, 12 GB RAM, Intel HD 520. Keep workflows lightweight. Do not require local model training, heavy 3D, VMs, or GPU-intensive processing. Use phones for camera testing and cloud services for AI/backend.

## Security
- `.env` is ignored.
- Commit `.env.example` only.
- Never expose DeepSpace/Gemini/Photon credentials in client code when a server-side path is required.
- Never include private tokens in screenshots or Devpost.

## Immediate Build Order
1. Initialize project and shared contracts.
2. Create/join room + player list.
3. Implement mission state machine and role assignment.
4. Make a complete digital playthrough before AR.
5. Implement marker-based physical puzzle verification.
6. Integrate AR result with shared game state.
7. Implement cooperative/final synchronized action.
8. Polish mobile UI and victory sequence.
9. Add Gemini.
10. Add Photon only if the MVP is stable.
11. Freeze features early enough for multi-device testing and Devpost.
