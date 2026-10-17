# Phase 1 — Foundation (hours 0–3)

1. Confirm DeepSpace login: `npx deepspace login`, then `npx deepspace whoami --json`.
2. Scaffold the app on the laptop: `npx create-deepspace roomshift` (name sets the `<name>.app.space` subdomain via `wrangler.toml`; choose it now).
3. Keep DeepSpace's generated layout. Add `shared/` (this folder) and map the repo structure from the context file onto it only where it fits.
4. `git init`, first commit on `main`, then push to GitHub. Branches: `feature/frontend`, `feature/backend`, `feature/ar`, `feature/reality-sync`.
5. Deploy the empty scaffold once to prove the pipeline and HTTPS on a real phone.
6. Open the DeepSpace support channel; ask: anonymous guest join, per-room player cap, presence on phone sleep, credit cost per connection, Gemini integration path.
7. Send a Discord/Slack message to teammates with the repo link and who owns which area.

Done when: scaffold deployed, 2 phones load it, shared types compile, branches exist.
