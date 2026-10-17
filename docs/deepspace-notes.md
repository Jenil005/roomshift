# DeepSpace Notes (Backend Phase 1)

Verified 2026-10-17 against docs.deep.space (llms-full.txt), the installed SDK `deepspace@0.42.3` (`backend/node_modules/deepspace/dist/*.d.ts`), the scaffold in `backend/`, and read-only CLI calls. "Docs:" marks a documented fact; "Inferred:" marks our reading of it.

## 0. Current state of our app

1. App id `app_01M54HW7T21S2M7E2YHC4D8W5T`, name `roomshift`, owner Jenil (free tier, 500 credits, 0 used).
2. **Already deployed:** `https://roomshift.app.space`, release seq 1, from commit `509ed12` in the nested repo `backend/roomshift/.git` (the untouched scaffold).
3. **Source is permanently latched to DeepSpace source** (`app source --json` → `provider: deepspace, revision 1`). This cannot be changed. GitHub source is no longer an option for this app id.
4. `backend/roomshift/` is a duplicate copy of the scaffold with its own `.git` (remote `space`), its own `node_modules`, and a `.dev.vars` file holding generated tokens (git-ignored). `backend/` itself has no `.git`.

## 1. Runtime model

1. One Cloudflare Worker (`backend/worker.ts`, Hono) serves the SPA, `/api/*` routes, and `/ws/*` WebSocket upgrades. Deployed at `<name>.app.space` over HTTPS.
2. Shared state lives in Durable Objects (DOs). `RecordRoom` = SQLite-backed collections with RBAC and live sync. Also `PresenceRoom`, `YjsRoom`, `CanvasRoom`, `CronRoom`, `JobRoom`.
3. A DO instance is identified by name. The scaffold's main data room is `app:<APP_ID>` (`SCOPE_ID` in `src/constants.ts`). Any other name (e.g. `rs:ABCD`) is a separate, isolated room.
4. Docs: you may add your own DO classes (declare in `__DO_MANIFEST__` in `worker.ts` + a new `[[migrations]]` tag in `wrangler.toml`).

## 2. Create a room (shared state)

1. Define a collection in `src/schemas/<name>-schema.ts` (`CollectionSchema`: `name`, `columns`, `permissions`), add it to `src/schemas.ts`. Schemas are baked in at deploy; changes need a redeploy.
2. Columns: `storage: 'text' | 'number'`, `interpretation: 'plain' | { kind: 'json' } | { kind: 'select', options }` etc. JSON columns round-trip arrays/objects automatically.
3. Records are envelopes: `{ recordId, data, createdBy, createdAt, updatedAt }`. Fields live under `record.data`.
4. A "game room" is just records in a collection (e.g. one `rs_rooms` row per room code), or a separate named RecordRoom instance per game.

## 3. Subscribe to state (client)

1. Wrap pages in `(app)/_layout.tsx`, which mounts `<RecordProvider allowAnonymous>` + `<RecordScope roomId={SCOPE_ID} schemas={schemas}>` (already in the scaffold).
2. `useQuery<T>('collection', { where, orderBy, limit })` opens a WebSocket, receives a snapshot, then live `create/update/delete` changes. `status: 'loading' | 'ready' | 'error'`.
3. `useMutations<T>('collection')` gives `create/put/remove` (fire-and-forget) and `*Confirmed` variants (await the server ACK, reject on RBAC denial).
4. The DO filters by RBAC **before** sending, so rows a caller cannot read never reach their device.
5. Reconnect: the SDK reconnects automatically (exponential backoff capped at 30 s, also on tab refocus) and re-subscribes with a fresh snapshot. Fire-and-forget writes made while offline are dropped.

## 4. Auth and identity

1. Sign-in is Google or GitHub OAuth through the platform auth worker. Docs: "Public email signup is closed platform-wide."
2. JWTs are ES256, 5-minute lifetime. Identity always comes from a verified JWT. Never put identity in WS URLs or headers (the scaffold's `wsRoute` strips it).
3. **Anonymous WebSocket** (no token): the DO assigns an ephemeral `anon-<uuid>` id with `viewer` role. SDK types: anonymous = "read-only viewers". Docs: never persist an `anon-*` id. It changes on every connection.
4. Anonymous callers match the `'*'` rule in a collection's `permissions`. They can **read** what `'*'` allows. They cannot be trusted to write.
5. Server actions (`POST /api/actions/:name`) **require a Bearer JWT**, so anonymous callers get 401.
6. Custom Hono routes in `worker.ts` are not auto-protected. We decide their auth (`verifyJwt` for accounts, or our own token).
7. Roles: `'*'` (anonymous), `viewer`, `member` (default for signed-in), `admin` (the owner is pinned to admin).

## 5. Server-side logic

1. **Server actions:** `src/actions/index.ts` exports `Record<string, ActionHandler>`. Context: `{ userId, params, tools, env, callerJwt }`. Return `{ success: true, data } | { success: false, error }`.
2. `tools.create/update/remove/get/query/deleteWhere` run with **RBAC off** (`X-App-Action: true`) and broadcast changes to subscribed clients like any write.
3. The same tools path is reachable from any worker route: `env.RECORD_ROOMS.get(idFromName(scope)).fetch('https://internal/api/tools/execute', { X-App-Action: 'true', X-User-Id, body: { tool: 'records.update', params } })`. The scaffold already does this in `src/server/action-routes.ts` and `realtime-routes.ts`.
4. Writes inside one DO are serialized. A worker route that reads, then writes through separate tool calls is **not** atomic. Inferred: race-sensitive logic (simultaneous holds, joins at the player limit) belongs inside a single DO.
5. Timers: `CronRoom` tasks have minute granularity (`intervalMinutes`). Sub-minute timers need a DO alarm (`onAlarm` on a custom DO) or lazy evaluation on the next request.
6. Background work: `JobRoom` + `enqueueJob(...)`.

## 6. Presence

1. `usePresence()`: online/offline from a heartbeat written to the `users` collection every 60 s, online if seen within 5 min (default). Signed-in users only.
2. `usePresenceRoom(scopeId)`: in-memory peer state over a `PresenceRoom` DO. A disconnect removes the peer from others within about 1 s. The scaffold route accepts anonymous sockets, but the anonymous id is ephemeral.
3. Neither is authoritative for our game. Inferred: we track `connected` ourselves from a client heartbeat plus `lastSeen`.

## 7. External APIs and secrets

1. Integration proxy: `tools.integration('<integration>/<endpoint>', body)` (server) or `integration.post(...)` (client). Billing per `src/integrations.ts` (`developer` = owner pays, `user` = caller pays, `anonymous: true` lets signed-out callers spend owner credits).
2. Catalog (`npx deepspace integrations list`): `gemini/generate-image` (images only), `dataforseo/llm-responses` (ChatGPT/Claude/Gemini text), `anthropic/*`, `openai/*`. No Gemini text endpoint under `gemini/`.
3. Secrets: `npx deepspace secrets set GEMINI_API_KEY=...`. Worker reads `env.GEMINI_API_KEY`. Deployed apps pick up changes **only on the next deploy**. `.dev.vars` is a generated cache: never edit or commit it.
4. Inferred: the worker is a normal Cloudflare Worker, so a direct `fetch()` to the Gemini REST API with the key from `env` works. Keep it server-side only.
5. Credits: 100 credits = US$1. Charged for integrations, AI, LiveKit, managed knowledge. Storage cap 128 MiB on free.

## 8. Deploy, source, logs

1. Commands: `npx deepspace auth whoami --json`, `npx deepspace dev start` (port 8780), `npx deepspace test run`, `npx deepspace deploy [--json]`.
2. DeepSpace source is commit-first: `deploy` (default `--push`) refuses a dirty worktree (`dirty_worktree`), pushes the current branch to the `space` remote, and records the commit. `--no-push` deploys without source lineage (and without the dirty check).
3. Deploy uses the Git repo that contains the app dir. `backend/` has no `.git`, so Git resolves to the **monorepo root** (`deepspace status` reports branch `feature/backend`, 107 dirty files).
4. Other refusals: `stale_base` (cannot prove the deploy contains the live release; `--ignore-stale` overrides), `behind_trunk`.
5. Logs: `npx deepspace logs [--follow] [--since 2h] [--level error] [--search x] [--json]`. A caught error is a `log` event, not an `exception`. Triage on `request.status`, `level`, `eventType`.
6. Also: `npx deepspace releases`, `activity`, `app usage`, `rollback`.
7. Never run `deepspace app undeploy`, `app transfer`, or `--claim-released` without the lead's go-ahead.
