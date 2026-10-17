# Puzzle 2: Comms Boot Sequence (and the Final Sequence)

Theme: after the breaker is restored, the terminal's comms stack has to boot in the right order. Each
player holds a different piece of the maintenance record. No one can solve it alone.

## Player experience
1. Four modules appear on the shared terminal: AUTH, NETWORK, DATABASE, UPLINK.
2. Each player privately sees 1-2 clues, for example "AUTH must come online before NETWORK."
3. Players talk it out and build the boot order together on a **shared draft** that updates live for everyone.
4. Anyone presses **Boot** to submit. Success sets `terminal` online and unlocks the Final Sequence.

## Rules (backend, authoritative)
1. At the start of `PUZZLE_2` call `generatePuzzle(playerIds, seed)` from `shared/puzzles/commsBoot.ts`. Use a server-side random seed and store the seed with the room.
2. Keep `solution` server-side only. Send each player only their own clue text (via `describe()`), as a private record.
3. The shared draft is public room state: an ordered list of up to 4 module ids. Any player may add, remove or reorder. Validate ids and ignore duplicates.
4. `puzzle:submit` for puzzle 2 carries the ordered module list. Validate with `checkOrder()`. Never accept a client "solved" flag.
5. Wrong answer: `puzzle:failed` with reason "Sequence rejected", then a cooldown before the next submit: 3 s after the 1st wrong try, 6 s after the 2nd, 10 s after that. No feedback on how close the guess was.
6. Hints (anti-deadlock): after 3 wrong attempts release hint 1 (`hints[0]`, "X boots first") to everyone; after 6, hint 2 (`hints[1]`, "Y boots last"). Show them as public narration.
7. Support 2-4 players. Clues are dealt round-robin from 5 true statements, so every player always gets at least one.
8. A reconnecting player gets their own clues back unchanged, plus the current draft and released hints.

## What the generator guarantees (tested)
1. For 2, 3 and 4 players, 2000 seeds each: the combined clues leave exactly one valid order.
2. No single player's clues allow fewer than 3 orders, so nobody can solve it alone.
3. Hints are always true. `checkOrder()` accepts only the exact solution and rejects wrong, duplicate or unknown modules.
4. Run it: compile `commsBoot.ts` and `commsBoot.test.ts`, then `node commsBoot.test.js`. Must print `ALL PASSED`.

Known limit: there are only 24 possible orders, so a determined group could guess. The cooldowns make that slow, and the
puzzle is built for demo and judging, not for repeat play.

## Final Sequence (the door)
No design existed for `FINAL_SEQUENCE`, so this is the minimum cooperative finale:
1. Server enters `FINAL_SEQUENCE` and shows "Hold to unlock the blast door."
2. Every connected player presses and holds a button. The client sends `final:press` with a `held: true/false`.
3. The server marks the door unlocked only if **all connected players are holding at the same moment** (within a 1.5 s window of server time). Otherwise it resets quietly and shows "Everyone must hold together."
4. On success: set `door` online, emit `game:complete`, phase `COMPLETE`.
5. If a player disconnects mid-sequence, they stop counting as required (otherwise one dead phone blocks the win).
6. Fallback: after 30 s of failed tries, the host alone can force the unlock. A demo must never get stuck.

## Contract additions the backend should add to `shared/events`
1. Client to server: `puzzle2:draft` (ordered module ids) and `final:press` (held flag).
2. Server to clients: `puzzle2:draftUpdated`, `puzzle2:hint`, `puzzle:failed` (with `retryAfterMs`).
3. Private record per player: `{ playerId, role, clues: string[] }`.
