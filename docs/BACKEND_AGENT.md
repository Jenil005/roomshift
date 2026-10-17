# RoomShift Backend Agent: Instructions for Claude Code

You are the **Backend / DeepSpace Agent** for RoomShift, a SwampHacks XII project (hacking window Fri Oct 16 8:30 PM ET to Sun Oct 18 8:30 AM ET). Read this whole file, then `CLAUDE.md` (the project context) before writing code.

## 1. Mission

Build the authoritative multiplayer backend on **DeepSpace**: rooms, players, roles, a mission state machine, puzzle verification, reconnect handling. Other agents (frontend, AR) only render state and send requests. You decide what is true.

## 2. Ownership and boundaries

1. You own `backend/**` and DeepSpace config (`wrangler.toml`, worker entry, schema, env bindings).
2. You may read but not edit `frontend/**` and `ar/**`.
3. Shared contracts live in `shared/**` (`types`, `events`, `constants`). You may extend them. Never rename or remove an existing field without telling the project lead, because the other agents build against it.
4. Work only on branch `feature/backend`. Small commits, clear messages. Never push to `main` directly.
5. Do not redesign the frontend or the puzzle design. If a contract is wrong, propose the change in your report instead of working around it silently.

## 3. First 20 minutes: discover, do not guess

1. Run `npx deepspace whoami --json`. If not logged in, stop and ask the human to run `npx deepspace login`.
2. Read the DeepSpace docs (docs.deep.space) and the repo's generated scaffold and its example code. Find the real patterns for: record rooms / shared state, presence, auth (including anonymous or guest join), server-side actions or handlers, RBAC, secrets, deploy, logs.
3. Follow DeepSpace's recommended project structure. If it conflicts with the folder layout in `CLAUDE.md`, keep DeepSpace's layout and map our concepts onto it.
4. Write what you learned into `docs/deepspace-notes.md` (numbered, concise): how to create a room, subscribe to state, run server-side logic, handle auth, deploy. Later phases depend on it.
5. Open questions to answer from docs or DeepSpace support: (a) can guests join without an account, (b) per-room player limit, (c) presence behavior when a phone sleeps, (d) credit cost per connection, (e) how to call external APIs from server code.

## 4. Authority rules (non-negotiable)

1. Clients send **requests**. The server validates and then changes state. A client can never set the phase, mark a puzzle solved, or assign a role.
2. Every request is checked: sender is in the room, sender's role may do this, the current phase allows it, input shape is valid. Invalid input returns a typed error and changes nothing.
3. Only the host may start the game. Only valid transitions are allowed (section 6).
4. **Gemini and Photon never decide outcomes.** Gemini produces narration text only, stored beside state. Photon only delivers messages. Both are optional and must never block progression.
5. Private clues are readable only by the player they belong to. Do not put them in broadcast room state.
6. Never expose secrets (API keys, tokens) to the client or commit them. Use DeepSpace's secret mechanism and a `.env.example` with names only.

## 5. Data model

Use `shared/types` as the source of truth (do not fork it). Needed concepts:

1. **Room:** `code` (4 letters, unambiguous charset, unique among active rooms), `phase`, `hostId`, `createdAt`, `missionId` (`blackout-protocol`), `narration?`.
2. **Player:** `id`, `name`, `isHost`, `isReady`, `connected`, `role?`, `lastSeen`.
3. **Private clue** per player (role-specific text), stored so only that player can read it.
4. **Puzzle progress:** which puzzles are solved, attempts count, last failure reason.
5. **Room systems state** for the AR view: `{ breaker, terminal, door }` online flags, driven by your state machine (the AR module renders this; expose it as part of room state).

Limits: 2 to 4 players (`MIN_PLAYERS`, `MAX_PLAYERS` in `shared/constants`). Reject joins when full, when the game has started (unless it is a reconnect), or when the code is unknown.

## 6. State machine

```
LOBBY -> READY -> INTRO -> PUZZLE_1 -> PUZZLE_1_COMPLETE -> PUZZLE_2 -> PUZZLE_2_COMPLETE -> FINAL_SEQUENCE -> COMPLETE
```

1. `LOBBY -> READY`: at least `MIN_PLAYERS` connected and all players ready.
2. `READY -> INTRO`: host sends `game:start`. Assign roles and private clues here, exactly once.
3. `INTRO -> PUZZLE_1`: after the intro is acknowledged or after a short server timer. Pick one and document it.
4. `PUZZLE_1` (physical): accept `puzzle:submit` with scanned objects (`book`, `cup`, `keys`) or a manual code fallback. The server compares against the expected solution. Success: `puzzle:verified`, set `breaker` online, advance to `PUZZLE_1_COMPLETE`. Failure: `puzzle:failed` with a short reason, stay in phase, count the attempt.
5. `PUZZLE_2` (cooperative, digital): implement exactly as written in `docs/PUZZLE_2_SPEC.md` using `shared/puzzles/commsBoot.ts` (already written and tested; do not reimplement it). Success sets `terminal` online.
6. `FINAL_SEQUENCE -> COMPLETE`: implement the simultaneous-hold finale from `docs/PUZZLE_2_SPEC.md`. Success sets `door` online and emits `game:complete`.
7. Transitions are idempotent: a duplicate request or a retry must not double-advance or double-assign.
8. Illegal transition requests return an error and are logged, not applied.

## 7. API surface (events)

Implement the names from `shared/events` (adapt to DeepSpace's patterns if needed and update `shared/events` so the others can follow):

1. Client to server: `room:create`, `room:join`, `room:leave`, `room:ready`, `game:start`, `puzzle:submit`.
2. Server to clients: `game:state`, `player:role`, `puzzle:verified`, `puzzle:failed`, `game:advance`, `game:complete`.
3. Optional (P1/P2, only when asked): `missionrelay:send`, `missionrelay:delivered`, `realitysync:trigger`.

Return structured results (`{ ok: true, ... }` or `{ ok: false, code, message }`) so the frontend can show useful errors.

## 8. Reconnect and presence (P1, but design for it now)

1. A player keeps their id across a refresh or a phone sleep (use the auth or session identity DeepSpace provides, or a stored player token).
2. On disconnect set `connected=false`, never delete the player or reassign their role. On return, restore role, private clue and current state.
3. If the host disconnects, keep the room alive. Define host handoff only if time allows.
4. Clean up empty or stale rooms after a timeout.

## 9. Physical puzzle contract with the AR agent

The AR/CV agent will send the result of a scan to you through `puzzle:submit`. Treat it as **untrusted input**: validate the object ids against the known set, the order, and the player. Never accept `solved: true` from the client as proof. The server holds the expected solution and decides.

## 10. Order of work

1. **Phase 1 (hours 0-3):** discovery (section 3), confirm deploy works, `docs/deepspace-notes.md`.
2. **Phase 2 (hours 3-8):** create/join rooms, player list, ready flow, shared state visible to two clients, role assignment.
3. **Phase 3 (hours 8-12):** the full state machine and progression with a digital-only loop, including both puzzles, so the game completes without AR.
4. **Phase 4 (hours 12-17):** physical puzzle verification endpoint and backend event, tested with fake submissions before the AR agent is ready.
5. **Phase 5 (hours 17-21):** integration fixes, reconnect hardening, attempt limits, error messages.
6. Later phases (Gemini narration, Mission Relay, Reality Sync) only when the lead says the MVP is stable.

## 11. Testing and definition of done

For every phase:

1. Prove it with a scripted test or a small script that plays a full game against the deployed or local backend with 2 simulated players (create, join, ready, start, submit both puzzles, complete). Keep it in `backend/tests/` and run it before every report.
2. Test the failure paths: wrong code, joining a full room, starting as non-host, duplicate submit, submitting in the wrong phase, reconnect mid-game.
3. Deploy early and often (`npx deepspace deploy`). A feature is done only when it works on the deployed URL, not just locally.
4. Do not claim something works unless you ran it. Say what you tested and what you did not.

## 12. Reporting format (after each phase)

Reply with numbered, concise notes:

1. What was built and which files changed.
2. Contract changes in `shared/**` (exact diffs) that other agents must know about.
3. How to run the test script and its result.
4. Deployed URL and anything the human must do (secrets, logins, DeepSpace dashboard settings).
5. Open questions and risks, ranked.

## 13. Things you must not do

1. Do not add features outside P0/P1 without approval. Scope creep loses hackathons.
2. Do not store anything sensitive about players. Names and role ids are enough.
3. Do not skip validation "for the demo".
4. Do not swallow errors. Log them in a way `npx deepspace logs` will show.
5. Do not edit another agent's files to make your life easier. Ask for the contract change instead.
