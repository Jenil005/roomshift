# RoomShift Backend: Everything to Run and Paste

Use `npx.cmd` instead of `npx` in PowerShell (or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once).

## A. One-time setup (team monorepo layout)

Your repo is the existing `roomshift-ar` monorepo on `feature/backend` (it already has `backend/`, `shared/`, `docs/`, `CLAUDE.md`). The DeepSpace app goes under `backend/`.

1. Unzip `roomshift-backend-pack.zip` over the repo root. It adds `ROOMSHIFT_CONTEXT.md`, `docs/*` and `shared/*`. It does not touch `CLAUDE.md`. Check that these exist before continuing: `docs/BACKEND_AGENT.md`, `docs/PUZZLE_2_SPEC.md`, `ROOMSHIFT_CONTEXT.md`, `shared/puzzles/commsBoot.ts`.
2. Remove the stray staged cache: `git restore --staged Microsoft`, then add `Microsoft/` to `.gitignore`. Run `git status` and make sure only project files are staged.
3. Log in (token expires about 09:23 UTC today): `npx.cmd deepspace auth login`, then `npx.cmd deepspace whoami --json`.
4. Move the scaffold in: copy everything from `C:\Users\pjeni\Projects\roomshift` into `backend\` of the repo, EXCLUDING `node_modules` and any `.git` folder. Then in `backend\` run `npm install`.
5. Do not run `git commit` with the `__APP_ID__` placeholder in place. Let Claude Code do the first `npx.cmd deepspace deploy` from `backend\` in Phase 1 and verify it does not create a nested git repo inside the monorepo.
6. From the repo root run `claude`.

## B. Paste these prompts into Claude Code, in order

Wait for each reply. Read it. Only paste the next prompt when the previous phase's test passes and you are happy.

### Prompt 1: Kickoff (Phase 1, discovery)

```
You are the Backend / DeepSpace Agent for RoomShift. Read docs/BACKEND_AGENT.md, ROOMSHIFT_CONTEXT.md, docs/PUZZLE_2_SPEC.md and CLAUDE.md fully. Work only on branch feature/backend and only in backend/** and DeepSpace config; you may extend shared/** but must report every contract change.

Phase 1 only: do not build features yet.
1. Read the DeepSpace docs and the generated scaffold. Find the real patterns for shared room state, presence, auth including guest or anonymous join, server-side actions, secrets, deploy and logs.
2. Write docs/deepspace-notes.md (numbered, concise) with exactly how to create a room, subscribe to state, run server logic, handle auth, and deploy.
3. Answer these from the docs: can guests join without an account, per-room player limit, presence when a phone sleeps, credit cost per connection, how server code calls external APIs.
4. Tell me the proposed backend file layout and how it maps to shared/types and shared/events. Wait for my approval before writing code.
Report in the format from section 12 of docs/BACKEND_AGENT.md.
```

### Prompt 2: Approve layout, build Phase 2 (rooms, players, roles)

```
Layout approved. Phase 2: build create room, join room by 4-letter code, leave, ready toggle, player list, host flag, and role assignment with private clues readable only by the owning player. Enforce MIN_PLAYERS and MAX_PLAYERS, reject unknown codes, full rooms, and joins after the game starts (except reconnects). Keep shared/types and shared/events as the contract and update them if needed, reporting diffs.
Write backend/tests/ with a scripted test that simulates 2 players creating, joining and readying, plus failure cases (unknown code, full room, non-host start). Run it. Deploy with npx.cmd deepspace deploy and verify on the deployed URL. Report per section 12 and say exactly what you ran and what you did not.
```

### Prompt 3: Phase 3 (state machine + Puzzle 2 + finale)

```
Phase 3: implement the full state machine from section 6 of docs/BACKEND_AGENT.md, digital-only for now. Use shared/puzzles/commsBoot.ts as is (do not reimplement it) and follow docs/PUZZLE_2_SPEC.md exactly: server-side seed, private clues, shared draft, cooldowns after wrong attempts, hints after 3 and 6 failures, and the simultaneous-hold Final Sequence with the disconnect rule and host force-unlock fallback. For Puzzle 1 use a temporary stub that accepts a manual code until I finalize the physical design; mark it clearly as a stub.
Make transitions idempotent and validate every request (sender in room, role, phase, input shape). Extend the scripted test to play a full 2-player game from create to COMPLETE, plus 3 and 4 player runs and failure paths (wrong phase, duplicate submit, non-host start, wrong sequence, reconnect mid-game). Run commsBoot.test too. Deploy and verify. Report per section 12.
```

### Prompt 4: Phase 4 (physical puzzle verification)

```
Phase 4: replace the Puzzle 1 stub with real verification. puzzle:submit carries scanned object ids (book, cup, keys) in order, or a manual code fallback. Treat input as untrusted: validate ids against OBJECT_IDS, order, sender and phase. Never accept a client solved flag. The server holds the expected solution (I will give you the exact solution and clue text; ask me for them now if you do not have them). Success sets breaker online and advances to PUZZLE_1_COMPLETE; failure returns a short reason and counts the attempt. Test with fake submissions, including wrong order, duplicates, unknown ids, and wrong phase. Deploy, verify, report per section 12.
```

### Prompt 5: Phase 5 (reconnect and hardening)

```
Phase 5: reconnect and hardening. Players keep their id across refresh or phone sleep, keep role and private clues, and the room keeps running if the host disconnects. Clean up stale rooms after a timeout. Add attempt limits and clear typed error messages for the frontend. Make sure errors show up in npx.cmd deepspace logs. Add a reconnect test (drop a player mid-puzzle, return, state restored). Run all tests, deploy, verify on the deployed URL, and report per section 12 with a ranked list of remaining risks.
```

## C. Utility prompts (use any time)

1. **Status check:**
```
Give me a numbered status: what works on the deployed URL, what you tested, what is broken or untested, and the current P0 blocker. No code changes.
```
2. **Something broke:**
```
Reproduce this first and show me the failing output before changing anything: <paste error>. Then fix the root cause, add a test that would have caught it, redeploy and verify.
```
3. **Contract change for other agents:**
```
List every change you made to shared/** since the last report as exact diffs, and what the frontend and AR agents must update.
```
4. **Context getting long:** type `/compact` in Claude Code, then paste: `Re-read docs/BACKEND_AGENT.md and docs/deepspace-notes.md, then continue from the last phase report.`
5. **Fresh start after a big phase:** type `/clear`, then paste Prompt 1's first sentence plus: `Phase N is complete; resume at Phase N+1 after re-reading docs/deepspace-notes.md.`

## D. Before the final submission

```
Prepare the backend for submission: update docs/deepspace-notes.md with a short section titled "How RoomShift uses DeepSpace" (real-time sync, auth, hosting, any other features actually used, each with the files that use it), confirm main is deployable, and list any secrets the human must set. Do not add features.
```
