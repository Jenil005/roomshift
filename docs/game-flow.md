# Blackout Protocol — MVP Game Flow

## Objective
Restore the facility before the countdown reaches zero.

## Phase 1 — Lobby
- Host creates room.
- 2–3 players join.
- Players mark ready.
- Server assigns roles.

## Phase 2 — Puzzle 1: Physical Order
Example objects: book, cup, keys.

Each player receives incomplete ordering information. Example:
- Player A: “Knowledge comes before containment.”
- Player B: “Access comes last.”
- Player C: “Containment is between the other two.”

Players communicate and arrange the real objects as:
`BOOK → CUP → KEYS`

AR/vision verifies marker positions. On success, mission power rises and the next phase unlocks.

## Phase 3 — Puzzle 2: Synchronized Cooperative Action
Two players receive different object targets. Another player receives timing/instruction information.

Required event example:
- Player A verifies target X.
- Player B verifies target Y within 5 seconds.
- Server confirms both events and advances.

## Phase 4 — Final Override
- Each player receives one part of the override code.
- Team communicates the final value/order.
- Required physical state is verified.
- All players press/hold ACTIVATE inside a short synchronization window.

## Victory
Server transitions game to `COMPLETE`.
All devices simultaneously show:
- POWER RESTORED
- LOCKDOWN DISABLED
- MISSION COMPLETE
- Completion time
- “Reality successfully shifted.”

## Demo Mode
Use a short timer / pre-positioned flow so judges experience the physical puzzle and victory inside 2–3 minutes.
