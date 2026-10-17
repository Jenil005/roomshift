import { candidates, checkOrder, describe as desc, generatePuzzle, satisfies, MODULES } from "./commsBoot";

let failures = 0;
const assert = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error("FAIL:", msg); } };

for (const n of [2, 3, 4]) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  let minAlone = 99;
  for (let seed = 1; seed <= 2000; seed++) {
    const p = generatePuzzle(ids, seed);
    const all = ids.flatMap((id) => p.constraints[id]);
    // 1. Together the clues pin down exactly one order, and it is the stored solution.
    const together = candidates(all);
    assert(together.length === 1, `n=${n} seed=${seed}: ${together.length} solutions together`);
    assert(together.length === 1 && together[0].join() === p.solution.join(), `n=${n} seed=${seed}: wrong unique solution`);
    // 2. Every player has at least one clue; nobody can solve alone.
    ids.forEach((id) => {
      assert(p.constraints[id].length >= 1, `n=${n} seed=${seed}: ${id} has no clue`);
      const alone = candidates(p.constraints[id]).length;
      minAlone = Math.min(minAlone, alone);
      assert(alone >= 3, `n=${n} seed=${seed}: ${id} can narrow to ${alone}`);
    });
    // 3. Hints are true statements about the solution; checker accepts the solution only.
    p.hints.forEach((h) => assert(satisfies(p.solution, h), `n=${n} seed=${seed}: false hint`));
    assert(checkOrder(p.solution, [...p.solution]).ok, "solution accepted");
    assert(!checkOrder(p.solution, [...p.solution].reverse()).ok, "reverse rejected");
  }
  console.log(`n=${n}: 2000 seeds ok, fewest candidates any single player is left with: ${minAlone}`);
}

assert(checkOrder([...MODULES], ["auth", "auth", "network", "uplink"]).ok === false, "duplicates rejected");
assert(checkOrder([...MODULES], "auth").ok === false, "non-array rejected");
assert(checkOrder([...MODULES], ["auth", "network", "database", "hack"]).ok === false, "unknown module rejected");
console.log("example clue:", desc({ kind: "before", a: "auth", b: "network" }));
if (failures) throw new Error(`${failures} failures`);
console.log("ALL PASSED");
