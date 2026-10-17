import { useGameClient } from "../game/GameProvider";
import { devJump } from "../game/mockClient";
import type { Phase } from "../shared/types";

const PHASES: Phase[] = ["LOBBY", "INTRO", "PUZZLE_1", "PUZZLE_1_COMPLETE", "PUZZLE_2", "FINAL_OVERRIDE", "COMPLETE", "FAILED"];

/** Add ?dev to the URL to jump between screens while building them (mock client only). */
export function DevPanel() {
  const client = useGameClient();
  return (
    <>
      <button
        type="button"
        onClick={() => devJump(client, "FAILED")}
        className="fixed bottom-12 left-2 z-[60] border-2 border-fault bg-void px-3 py-2 font-display text-[14px] text-fault"
      >
        DEV: SHOW GAME OVER
      </button>
    <select
      aria-label="Jump to phase"
      defaultValue=""
      onChange={(e) => e.target.value && devJump(client, e.target.value as Phase)}
      className="fixed bottom-2 left-2 z-[60] bg-void p-1 text-[16px] text-phosphor"
    >
      <option value="">dev: jump…</option>
      {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
    </>
  );
}
