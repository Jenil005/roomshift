import { useCallback, useEffect, useState } from "react";
import type { SubmitData } from "@shared/events";
import { PhysicalPuzzle, type ScanMode } from "../../../ar/PhysicalPuzzle";
import { loadPreferredDetector, releaseDetectors } from "../../../ar/detect/selectDetector";
import type { PhysicalPuzzleResult } from "../../../ar/types";
import { OBJECT_CLUE_WORD, powerPercent } from "../game/content";
import { toPuzzle1Submission } from "../game/evidence";
import { usePuzzle1Scans } from "../game/usePuzzle1Scans";
import { useGame } from "../game/useGame";
import { PowerBar, Screen } from "../ui/kit";
import { MissionHeader } from "../ui/MissionHeader";
import { ServerError } from "../ui/ServerError";
import { useSecondsUntil } from "../ui/time";

/**
 * Puzzle 1. One scanner owns the camera (AI, QR backup, or manual report, all inside
 * ar/PhysicalPuzzle). Objects are scanned one at a time: each recognized object goes to the
 * server (puzzle1:scan), which keeps the team's progress and judges the sequence. Nothing
 * here decides the puzzle is solved.
 */
// COCO-SSD by default; ?detector=mediapipe or ?detector=auto selects MediaPipe (see selectDetector).
const loadDetector = () => loadPreferredDetector();

// The chosen mode survives switching to the facility and back (this screen remounts).
let rememberedMode: ScanMode = "ai";

export function Puzzle1() {
  const { room, clue, send, lastSubmit } = useGame();
  const { host } = usePuzzle1Scans();
  const [mode, setMode] = useState<ScanMode>(rememberedMode);
  const [armed, setArmed] = useState(0); // remounting re-arms the manual form after a rejection
  const [checking, setChecking] = useState(false);
  const retry = useSecondsUntil(lastSubmit?.puzzle === 1 ? lastSubmit.retryAt : null);

  // Free the detector's GPU memory once the puzzle is behind us.
  useEffect(() => () => releaseDetectors(), []);

  const onModeChange = useCallback((next: ScanMode) => {
    rememberedMode = next;
    setMode(next);
  }, []);
  // Only the manual report arrives here; camera scans go through `host`.
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
  const manualRejected = mode === "manual" && lastSubmit?.puzzle === 1 && !lastSubmit.solved;

  return (
    <Screen className="ar-screen">
      <MissionHeader step="Puzzle 1 of 3" title="Breaker: scan sequence" />
      <p className="ar-clue m-0 bg-inset p-3 bevel-sunken">
        <span className="text-label">Your fragment: </span>{clue?.clues.join(" ") ?? "Receiving…"}
      </p>
      <p className="ar-instruction m-0">
        Agree on the order with your team, then scan the book, cup and keyboard one at a time in that order. Each object stays scanned.
      </p>

      {checking && <p role="status" className="m-0 text-phosphor">Report sent. The facility is checking it…</p>}
      {manualRejected && !checking && (
        <p role="alert" className="m-0 text-emergency">
          {lastSubmit.reason ?? "Report rejected"}.{retry > 0 ? ` Breaker resetting ${retry}s.` : " Compare your fragments and try again."}
        </p>
      )}
      <ServerError actions={["puzzle:submit", "puzzle1:restart"]} />
      <PhysicalPuzzle
        key={armed}
        initialMode={mode}
        onModeChange={onModeChange}
        onResult={onResult}
        scans={{ ...host, labels: OBJECT_CLUE_WORD }}
        loadDetector={loadDetector}
        serverJudged
      />

      <PowerBar value={powerPercent(room.systems)} />
    </Screen>
  );
}
