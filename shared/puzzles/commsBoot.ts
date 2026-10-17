// Puzzle 2: "Comms Boot Sequence". Pure, deterministic, framework-free.
// The BACKEND runs generatePuzzle() once at game start and keeps `solution` server-side.
// Clients only ever receive their own player's `clues` (text) and, later, public hints.

export const MODULES = ["auth", "network", "database", "uplink"] as const;
export type ModuleId = (typeof MODULES)[number];

export type Constraint =
  | { kind: "before"; a: ModuleId; b: ModuleId }
  | { kind: "notFirst"; a: ModuleId }
  | { kind: "notLast"; a: ModuleId }
  | { kind: "first"; a: ModuleId } // used for public hints only
  | { kind: "last"; a: ModuleId }; // used for public hints only

export interface GeneratedPuzzle {
  solution: ModuleId[]; // SERVER ONLY. Never send to clients.
  constraints: Record<string, Constraint[]>; // playerId -> that player's private constraints
  hints: [Constraint, Constraint]; // public hints released after repeated failures (also derived from the solution)
}

// Small seeded RNG so a game can be reproduced from its seed for debugging.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function satisfies(order: readonly ModuleId[], c: Constraint): boolean {
  switch (c.kind) {
    case "before": return order.indexOf(c.a) < order.indexOf(c.b);
    case "notFirst": return order[0] !== c.a;
    case "notLast": return order[order.length - 1] !== c.a;
    case "first": return order[0] === c.a;
    case "last": return order[order.length - 1] === c.a;
  }
}

export function allOrders(): ModuleId[][] {
  const out: ModuleId[][] = [];
  const rec = (rest: ModuleId[], acc: ModuleId[]) => {
    if (!rest.length) return void out.push(acc);
    rest.forEach((m, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, m]));
  };
  rec([...MODULES], []);
  return out;
}

export function candidates(cs: readonly Constraint[]): ModuleId[][] {
  return allOrders().filter((o) => cs.every((c) => satisfies(o, c)));
}

// Minimum orders a single player's private clues must still allow, so nobody can solve it alone.
const MIN_ALONE_CANDIDATES = 3;

export function generatePuzzle(playerIds: string[], seed: number): GeneratedPuzzle {
  if (playerIds.length < 2 || playerIds.length > 4) throw new Error("Comms Boot supports 2-4 players");
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const solution = shuffle(MODULES, rnd);
    const chain: Constraint[] = [0, 1, 2].map((i) => ({ kind: "before", a: solution[i], b: solution[i + 1] }));
    const notLast: Constraint = { kind: "notLast", a: shuffle(solution.slice(0, 3), rnd)[0] };
    const notFirst: Constraint = { kind: "notFirst", a: shuffle(solution.slice(1), rnd)[0] };
    const pool = shuffle([...chain, notLast, notFirst], rnd);

    const dealt: Record<string, Constraint[]> = {};
    playerIds.forEach((id) => (dealt[id] = []));
    pool.forEach((c, i) => dealt[playerIds[i % playerIds.length]].push(c));

    const ok = playerIds.every((id) => candidates(dealt[id]).length >= MIN_ALONE_CANDIDATES);
    if (!ok) continue;

    // Public hints, released by the backend after repeated wrong attempts (true by construction).
    const hints: [Constraint, Constraint] = [
      { kind: "first", a: solution[0] },
      { kind: "last", a: solution[3] },
    ];
    return { solution, constraints: dealt, hints };
  }
  throw new Error("Could not generate a fair puzzle");
}

export type CheckResult = { ok: true } | { ok: false; reason: "wrong" | "invalid" };

export function checkOrder(solution: readonly ModuleId[], submitted: unknown): CheckResult {
  if (!Array.isArray(submitted) || submitted.length !== MODULES.length) return { ok: false, reason: "invalid" };
  const set = new Set(submitted);
  if (set.size !== MODULES.length || !submitted.every((m) => (MODULES as readonly unknown[]).includes(m))) {
    return { ok: false, reason: "invalid" };
  }
  return submitted.every((m, i) => m === solution[i]) ? { ok: true } : { ok: false, reason: "wrong" };
}

// Rendering helpers (text only; the frontend or Gemini may restyle but must keep the meaning).
export const MODULE_LABEL: Record<ModuleId, string> = {
  auth: "AUTH",
  network: "NETWORK",
  database: "DATABASE",
  uplink: "UPLINK",
};

export function describe(c: Constraint): string {
  switch (c.kind) {
    case "before": return `${MODULE_LABEL[c.a]} must come online before ${MODULE_LABEL[c.b]}.`;
    case "notFirst": return `${MODULE_LABEL[c.a]} cannot be the first module to boot.`;
    case "notLast": return `${MODULE_LABEL[c.a]} is never the last module to boot.`;
    case "first": return `${MODULE_LABEL[c.a]} boots first.`;
    case "last": return `${MODULE_LABEL[c.a]} boots last.`;
  }
}
