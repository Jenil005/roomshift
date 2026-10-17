# RoomShift — Claude Project Context

> **Purpose:** This file gives Claude Code and any Claude subagents the full context for the RoomShift project.
>
> **IMPORTANT HACKATHON RULE:** SwampHacks XII requires all submitted projects to be new. RoomShift must **not** be implemented before hacking officially begins on **Friday, October 16, 2026 at 8:30 PM ET**. Before that time, Claude may help with planning, research, architecture, prompts, task breakdowns, environment setup, learning, and documentation only. Do **not** generate or save production RoomShift code before the hackathon starts.
>
> Once hacking begins, this file may be placed at the root of the new RoomShift repository as `CLAUDE.md`.

---

## 1. Project Name

**RoomShift**

### Tagline
**Turn your real-world surroundings into a multiplayer adventure.**

### One-sentence pitch
RoomShift is a cooperative AR-inspired multiplayer escape-room experience where players use their phones to interact with real physical objects, receive asymmetric clues, and solve synchronized puzzles while a shared digital world reacts in real time.

---

## 2. Hackathon

**Event:** SwampHacks XII  
**Dates:** October 16–18, 2026  
**Hacking window:** Friday 8:30 PM → Sunday 8:30 AM  
**Team size:** 2–4 people  
**Project Expo / judging:** Sunday 10:00 AM–12:00 PM  
**Typical judge interaction:** approximately 2–3 minutes  
**Submission deadline:** Sunday at 8:30 AM ET

### Official competition rule that affects development
Projects must be new and cannot be started before hacking begins.

### Primary target track
**Entertainment & Creative Technology — Swamp Studios**

### Additional challenge / sponsor targets
1. **DeepSpace Sponsor Challenge**
2. **Photon / Spectrum sponsor integration** — target if SwampHacks publishes a matching challenge; confirm official requirements before claiming eligibility
3. **Best Use of Gemini API**
4. **Easy On The Eyes**
5. **Overall Prize** — automatically considered

### Not a priority
- AI-specific track unless AI becomes technically central and non-trivial.
- Least Vibe Coded, because the team intends to use Claude Code heavily.
- Roblox prize unless RoomShift becomes primarily built inside Roblox Studio with core logic in Luau.

---

## 3. Product Vision

RoomShift should feel like a combination of:

- a physical escape room,
- a multiplayer mobile game,
- asymmetric cooperative gameplay,
- computer vision / AR interaction,
- adaptive storytelling,
- and optionally a connected virtual world.

The key differentiator is:

> Players do not merely tap through a digital game. Their physical surroundings and real objects become part of the gameplay.

### Sponsor integration philosophy
Sponsor technologies should each have a clear gameplay responsibility:
- **DeepSpace:** authoritative multiplayer state and realtime synchronization.
- **Photon Spectrum:** optional Mission Relay for private clues / mission messages on a real communication channel.
- **Gemini:** adaptive narrative and flavor, never puzzle authority.
- **Roblox:** optional Reality Sync visual world reaction.

Do not add sponsor technology solely to increase the number of integrations. Every integration must improve the demo or the player experience.

---

## 4. Initial Adventure

### Mission name
**Blackout Protocol**

### Setting
A futuristic research facility has lost power. The players must restore critical systems before lockdown becomes permanent.

### Target play time
**5–8 minutes** for the full experience.

### Judge demo mode
**2–3 minutes maximum.**

### Initial players
Prefer **2–3 players** for the MVP.

### Initial physical objects
Use simple, predictable objects such as:

- a book,
- a cup,
- keys,

or clearly printed visual markers attached to them.

The MVP should prioritize reliability over unrestricted object recognition.

---

## 5. Core Gameplay Loop

1. A host creates a RoomShift game.
2. Other players join using a room code or QR code.
3. Each player receives a unique role and private clue.
4. Players communicate and cooperate.
5. Players physically interact with objects.
6. RoomShift verifies a physical action.
7. DeepSpace synchronizes the new game state to all players.
8. Optional Mission Relay can deliver a private clue or mission update through Photon Spectrum.
9. Gemini may generate short narrative transitions.
10. Players complete a second cooperative challenge.
11. The mission ends with a strong visual/audio success state.
12. Optional Reality Sync triggers a change in Roblox.

---

## 6. Core MVP Requirements

The MVP is complete only when all of the following work:

### Multiplayer
- Create a room.
- Join a room.
- Support at least 2 players.
- Prefer support for 2–4 players.
- Assign different player roles.
- Synchronize game state.
- Recover gracefully from temporary disconnects if feasible.

### Gameplay
- One complete mission.
- One beginning.
- One ending.
- At least two meaningful challenges.
- At least one challenge must depend on physical interaction.

### Physical interaction
At least one reliable real-world action must be validated.

Possible MVP approaches:
- marker-based tracking,
- QR / fiducial marker scanning,
- lightweight object detection,
- relative marker positions,
- or a fallback scan sequence.

Reliability is more important than technological complexity.

### UI
Must work on real phones.

Required screens:
- Landing / Create or Join
- Lobby
- Role reveal
- Mission
- Puzzle
- Progress / status
- Victory / mission complete

### AI
Gemini should enhance the experience but must **not** control critical game state.

Use Gemini for:
- narration,
- contextual descriptions,
- short adaptive dialogue,
- flavor text,
- optional environment interpretation.

Do not let Gemini independently determine whether a puzzle is solved.

### Failure fallback
The game must remain playable if Gemini fails.

### Mission Relay
**Mission Relay** is an optional P1 feature powered by Photon Spectrum. It can deliver role-specific clues or mission updates through a real communication channel instead of only inside the RoomShift web UI.

Good uses:
- send a private clue to one player,
- send an urgent mission update after a puzzle is solved,
- deliver an asymmetric instruction that another player cannot see,
- make the game feel like a live field operation.

Rules:
- DeepSpace remains the authoritative source of game state.
- Photon only delivers messages/events; it must not decide puzzle outcomes.
- The same clue must always be available as an in-app fallback.
- Do not require a judge to share personal contact information for the core demo. Use a teammate-controlled test channel if necessary.
- Confirm SwampHacks' official Photon challenge requirements before claiming sponsor-challenge eligibility.

Implementation target:
- Photon Spectrum / `spectrum-ts`
- Spectrum Cloud if practical during the hackathon
- Keep provider choice simple; use one reliable channel rather than several

---

## 7. Reality Sync

**Reality Sync** is a special stretch feature, not the core MVP.

### Concept
A verified action in the physical world causes an immediate change inside a Roblox environment.

Example:

1. Players solve the physical object puzzle.
2. RoomShift verifies the solution.
3. DeepSpace updates mission state.
4. Roblox reads the mission state through an HTTPS bridge.
5. A generator turns on.
6. Lights change.
7. A security door opens.

### Purpose
Reality Sync should create a memorable “whoa” moment during judging.

### Rule
Do not work on Reality Sync until the main RoomShift experience is stable.

### Roblox implementation
If used:
- Roblox Studio
- Luau
- server-side `HttpService`
- minimal 3D environment
- no complex custom 3D modeling required

Avoid making Roblox a dependency for core gameplay.

---

## 8. Recommended Architecture

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS

### Backend / real-time
**DeepSpace** should be the primary backend platform when practical.

Use it for:
- sessions,
- players,
- roles,
- real-time state,
- puzzle progress,
- synchronized events,
- optional storage,
- optional auth.

### AI
- Gemini API

### Messaging / Mission Relay
- Photon Spectrum (`spectrum-ts`)
- Prefer a hosted Spectrum Cloud project for hackathon speed if available
- Use one reliable provider/channel for the demo
- In-app clue delivery remains the mandatory fallback

### Physical interaction
Possible tools:
- AR.js
- MediaPipe
- browser camera APIs
- marker / QR libraries
- lightweight OpenCV-style approaches if needed

### Roblox
- Roblox Studio
- Luau
- HttpService

### Version control
- Git
- GitHub

### Deployment
Prefer a simple HTTPS deployment suitable for mobile browser camera access.

---

## 9. Suggested Repository Structure

Once hacking begins:

```text
roomshift/
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── styles/
│   └── services/
│
├── backend/
│   ├── rooms/
│   ├── game/
│   ├── players/
│   └── api/
│
├── ar/
│   ├── camera/
│   ├── detection/
│   ├── markers/
│   └── puzzles/
│
├── integrations/
│   ├── gemini/
│   ├── photon/
│   └── roblox/
│
├── shared/
│   ├── types/
│   ├── constants/
│   └── events/
│
├── docs/
│   ├── architecture.md
│   ├── demo-script.md
│   └── devpost-notes.md
│
├── tests/
└── README.md
```

This structure may change if DeepSpace has a recommended project structure.

---

## 10. Shared Game State

Suggested game states:

```text
LOBBY
READY
INTRO
PUZZLE_1
PUZZLE_1_COMPLETE
PUZZLE_2
PUZZLE_2_COMPLETE
FINAL_SEQUENCE
COMPLETE
```

The backend should be authoritative.

Clients may request or submit actions, but clients should not directly decide that a puzzle is complete.

---

## 11. Suggested Events / Actions

Names may change depending on DeepSpace patterns.

```text
room:create
room:join
room:leave
room:ready
game:start
player:role
game:state
puzzle:submit
puzzle:verified
puzzle:failed
game:advance
game:complete
missionrelay:send
missionrelay:delivered
realitysync:trigger
```

Maintain shared TypeScript types for events when possible.

---

## 12. Current Team

### Member 1 — Jenil Patel
**Role:** Project Lead / Integration Developer

Primary responsibilities:
- product decisions,
- architecture,
- Claude orchestration,
- integration,
- Gemini,
- Photon / Mission Relay integration if used,
- Git / repository management,
- deployment,
- testing,
- presentation,
- Devpost coordination,
- Reality Sync if time allows.

Relevant background:
- Cybersecurity student
- prior hackathon experience including HackGT 13
- comfortable with technical troubleshooting, GitHub, APIs, Linux, and infrastructure
- does not need to own the most advanced computer vision implementation alone

### Member 2 — UF CS sophomore
**Major:** Computer Science  
**School:** University of Florida

Current exact technical strengths are not yet known.

Tentative role:
**Full-Stack / DeepSpace Developer**

Do not permanently assign this role until their strengths are confirmed.

Ask for:
- strongest programming languages,
- React experience,
- backend experience,
- database experience,
- real-time systems experience,
- game development experience,
- computer vision experience,
- Roblox experience,
- laptop specs.

Also ask whether they are comfortable owning **Photon Spectrum / Mission Relay** if they have messaging, TypeScript, or backend integration experience.

---

## 13. Desired Additional Teammates

The team may contain up to 4 people.

### Desired Member 3 — AR / Computer Vision Developer
Ideal skills:
- camera APIs,
- MediaPipe,
- OpenCV,
- AR.js,
- image processing,
- object or marker detection,
- JavaScript/TypeScript or Python.

Primary ownership:
`ar/**`

### Desired Member 4 — Frontend / Game Experience Developer
Ideal skills:
- React,
- TypeScript,
- responsive design,
- UI/UX,
- animation,
- game design,
- Figma.

Primary ownership:
`frontend/**`

Alternative:
If a strong Roblox/game developer joins, this role may become a hybrid UI + Roblox role.

---

## 14. Development Machine Constraints

### Jenil's laptop
- Intel Core i7-6500U
- 12 GB RAM
- 256 GB SSD
- Intel HD Graphics 520
- Windows x64

### Design around these constraints
Good for:
- VS Code
- Claude Code
- React
- TypeScript
- Node
- DeepSpace
- Gemini API
- Photon Spectrum / `spectrum-ts`
- Git
- browser testing
- lightweight Roblox Studio work

Avoid depending on:
- heavy local AI models,
- Unreal Engine,
- large Unity projects,
- heavy Blender workflows,
- GPU-intensive CV training,
- multiple VMs,
- Docker-heavy workflows unless necessary.

Prefer cloud APIs and phone-side camera processing.

Do not run unnecessary development services simultaneously.

---

## 15. Claude Code Strategy

Claude should function like a coordinated engineering team, not a single “build everything” agent.

### Recommended primary agents

#### Architect / Orchestrator
Understands the entire project.

Responsibilities:
- maintain architecture,
- split tasks,
- track dependencies,
- prevent scope creep,
- define interfaces,
- review integrations.

The architect should avoid making large code edits unless explicitly asked.

---

#### Frontend Agent

Own:
`frontend/**`

Responsibilities:
- landing page,
- room creation / joining,
- lobby,
- role screen,
- mission interface,
- puzzle UI,
- timer,
- progress,
- victory screen,
- responsive mobile styling.

Must not modify:
- backend internals,
- AR implementation,
- Roblox implementation.

---

#### Backend / DeepSpace Agent

Own:
`backend/**`
and relevant DeepSpace configuration.

Responsibilities:
- room state,
- player state,
- roles,
- synchronization,
- authoritative progression,
- reconnect behavior,
- API boundaries.

Must not independently redesign frontend.

---

#### AR / CV Agent

Own:
`ar/**`

Responsibilities:
- camera initialization,
- detection,
- marker/object tracking,
- physical puzzle verification,
- graceful fallback.

Expose a clean interface to the rest of the system.

Example output concept:

```ts
type PhysicalPuzzleResult = {
  solved: boolean;
  confidence?: number;
  evidence?: string[];
};
```

---

#### Photon / Mission Relay Agent

Own:
`integrations/photon/**`

Activate after the multiplayer MVP is stable.

Responsibilities:
- configure Photon Spectrum / `spectrum-ts`,
- connect one reliable communication provider/channel,
- deliver private role clues or mission updates,
- map DeepSpace game events to outbound messages,
- report delivery failures cleanly,
- preserve an in-app fallback for every message.

Must not:
- make Photon the authoritative source of game state,
- require Mission Relay for mission completion,
- expose project secrets in client-side code,
- add multiple providers unless one provider is already stable.

---

#### Reality Sync Agent

Own:
`integrations/roblox/**`

Only activate when the core MVP is stable.

Responsibilities:
- Roblox endpoint communication,
- Luau scripts,
- polling/event bridge,
- one reliable virtual reaction.

---

#### QA / Reviewer Agent

Prefer read-only review first.

Responsibilities:
- TypeScript errors,
- broken imports,
- unsafe secrets,
- duplicate logic,
- race conditions,
- mobile issues,
- missing error handling,
- poor accessibility,
- integration failures,
- obvious security flaws.

Report findings by severity:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

---

#### Docs / Devpost Agent

Own:
`docs/**`
and optionally README updates.

Responsibilities:
- track completed features,
- architecture explanation,
- DeepSpace usage,
- Photon / Mission Relay usage if completed,
- Gemini usage,
- technical challenges,
- lessons learned,
- demo instructions,
- Devpost draft material.

This agent should only claim features that actually work.

---

## 16. Rules for Claude Agents

Every agent must:

1. Stay inside its assigned ownership boundaries unless explicitly authorized.
2. Read shared types/interfaces before coding.
3. Avoid changing architecture without explaining why.
4. Never commit API keys or secrets.
5. Use environment variables for secrets.
6. Prefer simple solutions during the hackathon.
7. Avoid adding unnecessary dependencies.
8. Run type checks/tests before declaring work complete.
9. Report assumptions.
10. List files changed.
11. Explain any breaking changes.
12. Avoid rewriting working code solely for style.
13. Preserve mobile compatibility.
14. Prefer reliability over cleverness.
15. Ask the architect to resolve conflicting contracts.

---

## 17. Definition of Done for Any Agent Task

A task is not done merely because code was written.

An agent should provide:

```text
STATUS:
Complete / Partially Complete / Blocked

FILES CHANGED:
- ...

WHAT WORKS:
- ...

TESTS RUN:
- ...

KNOWN ISSUES:
- ...

ASSUMPTIONS:
- ...

INTEGRATION NOTES:
- ...
```

---

## 18. Git Strategy

Do not allow multiple agents to modify the same area carelessly.

Suggested branches:

```text
main
feature/frontend
feature/backend
feature/ar
feature/reality-sync
```

Prefer Git worktrees or separate branches for parallel agent work.

General workflow:

1. Agent implements task.
2. Agent runs validation.
3. Human reviews diff.
4. Merge.
5. Run full application.
6. Continue.

`main` should remain demoable as often as practical.

---

## 19. Code Quality Expectations

Use:
- TypeScript strict mode where practical.
- clear names.
- small focused functions.
- shared types.
- predictable state transitions.
- basic comments for non-obvious logic.
- error boundaries / graceful error states where useful.
- accessible controls.
- responsive layouts.
- concise dependencies.

Avoid:
- giant files,
- hidden global state,
- unexplained magic numbers,
- duplicated event names,
- random experimental libraries,
- unnecessary abstraction,
- premature optimization.

---

## 20. Secret Management

Never place credentials in:
- source files,
- README,
- Git history,
- screenshots,
- Devpost.

Use environment variables.

Example:

```text
GEMINI_API_KEY=
DEEPSPACE_...
PHOTON_PROJECT_ID=
PHOTON_PROJECT_SECRET=
ROBLOX_...
```

Commit only a safe `.env.example`.

---

## 21. Scope Rules

### P0 — Must ship
- Room creation / joining
- 2+ players
- role assignment
- synchronized state
- complete mission
- physical interaction
- mobile UI
- victory state
- deployed demo

### P1 — Strongly desired
- polished UI
- audio feedback
- Mission Relay through Photon Spectrum, with in-app fallback
- Gemini narration
- reconnect handling
- 3 players
- QR join flow

### P2 — Stretch
- Reality Sync
- Roblox environment
- advanced object recognition
- dynamic mission adaptation
- additional missions

### P3 — Do not build during hackathon unless everything else is finished
- large 3D world
- custom model training
- unlimited procedural puzzles
- voice assistant
- remote spatial multiplayer
- creator marketplace
- accounts/social network
- payments
- complex hardware

---

## 22. Failure Fallbacks

### If computer vision fails
Use marker-based or QR-based verification.

### If Photon / Mission Relay fails
Display the exact clue or mission update inside RoomShift. Mission Relay must never block progression.

### If Gemini fails
Use predefined narrative strings.

### If Reality Sync fails
Remove it from the live demo. Core RoomShift remains playable.

### If DeepSpace integration becomes blocked
Use the simplest compliant fallback architecture possible, but prioritize continuing to use DeepSpace if practical because it is a sponsor target.

### If multiplayer becomes unstable
Reduce to 2 players before sacrificing the full experience.

### If time is running out
Cut features; do not add new ones.

---

## 23. 36-Hour Suggested Build Order

### Phase 1 — Foundation
Hours 0–3
- create new repo
- initialize stack
- define shared types
- confirm DeepSpace
- establish branch strategy

### Phase 2 — Multiplayer skeleton
Hours 3–8
- create/join rooms
- player list
- roles
- shared state

### Phase 3 — Mission engine
Hours 8–12
- state machine
- progression
- first complete digital gameplay loop

### Phase 4 — Physical puzzle
Hours 12–17
- camera
- markers/detection
- validation
- backend event

### Phase 5 — Complete playable MVP
Hours 17–21
- integrate frontend/backend/AR
- beginning-to-ending playthrough

### Phase 6 — Polish
Hours 21–25
- mobile UX
- sound
- transitions
- error states

### Phase 7 — Mission Relay
Hours 23–26
- configure Photon Spectrum
- connect one reliable provider/channel
- send one private clue or mission update
- verify in-app fallback

### Phase 8 — Gemini
Hours 26–28
- narrative enhancement
- fallback strings

### Phase 9 — Reality Sync
Hours 28–31
Only if MVP is stable.

### Phase 10 — QA
Hours 31–34
- multi-device testing
- connection testing
- clean deployment
- demo reset process

### Phase 11 — Submission
Hours 34–36
- README
- Devpost
- screenshots
- architecture description
- challenge opt-ins
- final demo rehearsal

Target internal feature freeze:
**Approximately 7:30 AM Sunday**, one hour before the official deadline.

---

## 24. Judge Demo

The judge has approximately 2–3 minutes.

### Target script

**0:00–0:20**
Explain:
“RoomShift turns ordinary physical spaces into cooperative multiplayer adventures.”

### 0:20–0:40
Judge joins via QR code.

### 0:40–1:00
Players receive different clues. If Mission Relay is enabled, one private clue can arrive through Photon while the in-app copy remains available as fallback.

### 1:00–1:30
Players physically arrange or scan objects.

### 1:30–1:45
RoomShift verifies the action.

### 1:45–2:00
DeepSpace synchronizes the state.

### 2:00–2:10
Optional Mission Relay sends a mission update through Photon.

### 2:10–2:20
Gemini produces contextual narrative.

### 2:20–2:30
Optional Reality Sync:
Roblox generator activates / door opens.

### Remaining time
Explain:
- architecture,
- DeepSpace,
- Photon / Mission Relay if completed,
- physical verification,
- future applications.

Do not spend most of the demo talking.

Let the judge interact.

---

## 25. Product Principles

1. **Playable beats ambitious.**
2. **Reliable beats technically exotic.**
3. **One memorable interaction beats ten weak features.**
4. **The physical world must matter.**
5. **Cooperation must matter.**
6. **AI enhances the game; AI is not the game.**
7. **Mission Relay adds immersion, but the in-app clue is always the fallback.**
8. **Reality Sync is a bonus, not a dependency.**
9. **Every important feature needs a fallback.**
10. **Optimize for the 2–3 minute judging experience.**
11. **Stop adding features when the core experience works.**

---

## 26. Possible Long-Term Vision

After the hackathon, RoomShift could evolve into a platform where users create location-aware multiplayer adventures for:

- escape rooms,
- classrooms,
- museums,
- events,
- team building,
- parties,
- interactive storytelling,
- tourism,
- mixed-reality games.

This is future vision only.

Do not spend hackathon time building the platform layer.

---

## 27. Questions Claude Should Ask Before Major Changes

When ambiguity matters, Claude should identify questions such as:

- How many players does the current build support?
- What are the teammate’s confirmed strengths?
- Which DeepSpace SDK/API patterns are working?
- Which physical verification method is currently most reliable?
- Is Photon Mission Relay stable, and does it have an in-app fallback?
- Is Gemini already functioning?
- Is Reality Sync still within schedule?
- What is the current P0 blocker?
- Is the current `main` branch demoable?

However, Claude should not stall on small decisions that can be safely made with reasonable assumptions.

---

## 28. Current Status Before Hackathon

As of the pre-hackathon planning stage:

- Project concept selected.
- Project name selected.
- Blackout Protocol selected as initial mission.
- Reality Sync selected as optional special feature.
- DeepSpace selected as primary sponsor integration target.
- Photon / Spectrum selected as a P1 sponsor integration candidate through Mission Relay; official SwampHacks challenge details still need confirmation.
- Gemini selected as optional AI enhancement.
- Two team members currently identified.
- Up to two additional members may be recruited.
- No RoomShift production code should exist yet.
- Architecture and execution plan are still allowed to be refined.

---

## 29. Instruction to Claude Right Now

### Before Friday, October 16, 2026 at 8:30 PM ET

Claude MAY:
- review this plan,
- improve architecture,
- identify risks,
- create task lists,
- prepare prompts for future agents,
- recommend tools,
- explain technologies,
- create diagrams,
- help recruit teammates,
- plan testing,
- plan the judge demo,
- plan the Devpost structure,
- help configure general developer tools.

Claude MUST NOT:
- build RoomShift production code,
- generate the final RoomShift application,
- create the actual project repository implementation,
- create the final Roblox RoomShift world,
- pre-build production UI,
- create production game logic that will later be submitted.

### After hacking officially begins

Claude may actively build RoomShift according to this document.

---

## 30. Final Mission

The goal is not to build the biggest project.

The goal is to build the most convincing version of this promise:

> **RoomShift makes the people and physical objects already around you part of a cooperative digital adventure.**

Every feature should support that promise.
