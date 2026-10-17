import { useCallback, useEffect, useState } from "react";
import type { SubmitData } from "@shared/events";
import { PhysicalPuzzle, type ScanMode } from "../../../ar/PhysicalPuzzle";
import { releaseCocoSsdDetector } from "../../../ar/detect/cocoSsdDetector";
import type { PhysicalPuzzleResult } from "../../../ar/types";
import { powerPercent } from "../game/content";
import { toPuzzle1Submission } from "../game/evidence";
import { useGame } from "../game/useGame";
import { PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { ServerError } from "../ui/ServerError";
import { useSecondsUntil } from "../ui/time";

/**
 * Puzzle 1. One scanner owns the camera (AI, QR backup, or manual report, all inside
 * ar/PhysicalPuzzle). Its local verdict is never trusted: the evidence goes to the server,
 * which re-derives the order from marker positions and checks the hold time.
 */
export function Puzzle1() {
  const { room, clue, send, lastSubmit } = useGame();
  const [mode, setMode] = useState<ScanMode>("ai");
  const [armed, setArmed] = useState(0); // remounting the scanner re-arms it after a rejection
  const [checking, setChecking] = useState(false);
  const retry = useSecondsUntil(lastSubmit?.puzzle === 1 ? lastSubmit.retryAt : null);

  // Free the detector's GPU memory once the puzzle is behind us.
  useEffect(() => () => releaseCocoSsdDetector(), []);

  const onResult = useCallback(
    async (result: PhysicalPuzzleResult) => {
      setChecking(true);
      const res = await send({ type: "puzzle:submit", submission: toPuzzle1Submission(result) });
      setChecking(false);
      if (!(res.ok && (res.data as SubmitData).solved)) setArmed((n) => n + 1);
    },
    [send],
  );
  if (!room) return null;
  const rejected = lastSubmit?.puzzle === 1 && !lastSubmit.solved;

  return (
    <Screen className="ar-screen">
      <MissionHeader step="Puzzle 1 of 3" title="Breaker: physical order" />
      <p className="ar-clue m-0 bg-inset p-3 bevel-sunken">
        <span className="text-label">Your fragment: </span>{clue?.clues.join(" ") ?? "Receiving…"}
      </p>
      <p className="ar-instruction m-0">Arrange the book, cup and keys on a table, left to right, then let the scanner read them.</p>

      {checking && <p role="status" className="m-0 text-phosphor">Evidence sent. The facility is checking it…</p>}
      {rejected && !checking && (
        <p role="alert" className="m-0 text-emergency">
          {lastSubmit.reason ?? "Arrangement rejected"}.{retry > 0 ? ` Breaker resetting ${retry}s.` : " Compare your fragments and try again."}
        </p>
      )}
      <ServerError actions={["puzzle:submit"]} />
      {retry > 0 ? (
        <p className="m-0 bg-inset p-4 text-center text-emergency bevel-sunken">Breaker resetting… {retry}s</p>
      ) : (
        <PhysicalPuzzle key={armed} initialMode={mode} onModeChange={setMode} onResult={onResult} serverJudged />
      )}

      <PowerBar value={powerPercent(room.systems)} />
    </Screen>
  );
}
