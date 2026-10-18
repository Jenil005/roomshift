import { useCallback, useMemo } from "react";
import type { ObjectId } from "@shared/types";
import type { HostScans } from "../../../ar/PhysicalPuzzle";
import { SCAN_COMPLETE_TEXT } from "../../../ar/scan/objectScan";
import type { ObjectScanReport, ScanNotice } from "../../../ar/types";
import { useSecondsUntil } from "../ui/time";
import { toScanInput } from "./evidence";
import { useGame } from "./useGame";

/**
 * Puzzle 1 scan progress for the scanner and the facility HUD. `accepted` is the server's
 * (shared by the team, so it survives switching views, reloads and reconnects); `scanned`
 * adds this phone's queued scans so a recognized object turns green at once. Success is
 * only shown once the server has accepted the whole sequence.
 */
export function usePuzzle1Scans() {
  const { room, scans, scanObject, restartScans, pending } = useGame();
  const retry = useSecondsUntil(scans.last?.retryAt);

  const accepted = useMemo<ObjectId[]>(() => room?.puzzle1?.scanned.map((s) => s.object) ?? [], [room?.puzzle1]);
  const scanned = useMemo<ObjectId[]>(
    () => [...accepted, ...scans.pending.filter((id) => !accepted.includes(id))],
    [accepted, scans.pending],
  );

  const solved = !!room && (room.puzzles[1].solved || room.phase === "PUZZLE_1_COMPLETE");
  const last = scans.last;
  let notice: ScanNotice | null = null;
  if (solved) notice = { tone: "success", text: SCAN_COMPLETE_TEXT };
  else if (last?.status === "rejected")
    notice = {
      tone: "error",
      text: `${last.reason ?? "Sequence rejected"}. Progress reset${retry > 0 ? `, breaker resetting ${retry}s` : ""}. Start again from the first object.`,
    };
  else if (last?.status === "error") notice = { tone: "error", text: `${last.reason ?? "Scan refused"}${retry > 0 ? ` (${retry}s)` : ""}` };

  const onObjectScanned = useCallback((scan: ObjectScanReport) => scanObject(toScanInput(scan)), [scanObject]);
  const onRestart = useCallback(() => void restartScans(), [restartScans]);

  const host: HostScans = {
    scanned,
    pending: scans.pending,
    onObjectScanned,
    notice,
    paused: retry > 0 || solved,
    onRestart,
  };
  return { host, accepted, scanned, retry, solved, restarting: pending === "puzzle1:restart" };
}
