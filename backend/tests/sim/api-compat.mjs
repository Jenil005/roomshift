#!/usr/bin/env node
// Checks which game API schema a DEPLOYED backend runs, without touching any real room.
//
//   node backend/tests/sim/api-compat.mjs https://roomshift.app.space
//
// Every probe targets a room code that cannot exist (ZZZZ is never handed out while unused,
// and a probe never creates a room) with a throwaway token, so nothing is written. The two
// schemas answer differently before any room is looked up:
//   current (sequential scans): puzzle1:scan passes validation -> 404 room_not_found
//                               old camera evidence           -> 400 bad_request
//   old (simultaneous hold):    puzzle1:scan                  -> 400 "Invalid discriminator value"
//                               old camera evidence           -> 404 room_not_found
// Exit code 0 = current schema, 1 = old or unknown schema.

const BASE = (process.argv[2] ?? 'https://roomshift.app.space').replace(/\/$/, '')
const TOKEN = 'api-compat-probe-0000000000000000'
const CODE = 'ZZZZ'

async function probe(body) {
  const res = await fetch(`${BASE}/api/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, code: CODE, playerToken: TOKEN }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, code: json.code, message: json.message ?? '' }
}

const passesSchema = (r) => r.status === 404 && r.code === 'room_not_found'
const rejectedBySchema = (r) => r.status === 400 && r.code === 'bad_request'

const probes = {
  'puzzle1:scan': await probe({ type: 'puzzle1:scan', scan: { object: 'book', source: 'ai', confidence: 0.8 } }),
  'puzzle1:restart': await probe({ type: 'puzzle1:restart' }),
  'old camera evidence': await probe({
    type: 'puzzle:submit',
    submission: { puzzle: 1, physical: { source: 'camera', markers: [], heldForMs: 1300 } },
  }),
}
for (const [name, r] of Object.entries(probes)) console.log(`${name.padEnd(20)} HTTP ${r.status} ${r.code ?? ''} ${r.message.slice(0, 90)}`)

const current =
  passesSchema(probes['puzzle1:scan']) && passesSchema(probes['puzzle1:restart']) && rejectedBySchema(probes['old camera evidence'])
const old = rejectedBySchema(probes['puzzle1:scan']) && passesSchema(probes['old camera evidence'])
const extra = /dev:command/.test(probes['puzzle1:scan'].message) ? ' (also exposes dev:command)' : ''

console.log(
  current
    ? `\n${BASE}: CURRENT schema (sequential scans). Matches main.`
    : old
      ? `\n${BASE}: OLD schema (simultaneous hold, no puzzle1:scan)${extra}. Scanning will fail with this frontend.`
      : `\n${BASE}: UNKNOWN schema. Inspect the responses above.`,
)
process.exit(current ? 0 : 1)
