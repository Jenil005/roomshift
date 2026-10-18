import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CameraFrameScanner } from "../../../ar/detect/CameraFrameScanner";
import { scanCandidates } from "../../../ar/detect/objectClasses";
import { loadPreferredDetector } from "../../../ar/detect/selectDetector";
import type { FacilitySession } from "../../../ar/facility/session";
import { useScanNotices } from "../../../ar/ScanProgress";
import type { HostScans } from "../../../ar/PhysicalPuzzle";
import { alreadyScannedText, crowdedText, decideFrame } from "../../../ar/scan/objectScan";
import { MARKER_IDS, MARKER_LABEL, type MarkerId } from "../../../ar/types";
import { useObjectDetector } from "../../../ar/useAiScanner";

// The same object is not reported again this soon, while the server records the first report.
const REPORT_DEBOUNCE_MS = 1_000;
// ?scanflip: for a device whose AR frames arrive upside down (see CameraFrameScanner).
const FLIP_ROWS = typeof location !== "undefined" && new URLSearchParams(location.search).has("scanflip");

/**
 * Object scanning inside AR: the detector runs on the AR engine's own camera frames
 * (FacilitySession.tapFrames), so the facility stays placed and tracking. Same rules as
 * the full scanner: one new confident object per frame is reported to the host (the game
 * server via usePuzzle1Scans), repeats show ALREADY SCANNED, crowded frames record nothing.
 */
export function useArScan(session: FacilitySession | null, enabled: boolean, ar: boolean, host: HostScans) {
  const model = useObjectDetector(enabled, loadPreferredDetector);
  const { notice, hint, justScanned } = useScanNotices(host.scanned, host.notice, host.pending);
  const [seeing, setSeeing] = useState<string[]>([]);
  const [scanner, setScanner] = useState<CameraFrameScanner | null>(null);
  // Frames arrive from the AR loop; they read the latest props through this ref.
  const latest = useRef({ host, hint });
  useLayoutEffect(() => {
    latest.current = { host, hint };
  });
  const lastReport = useRef<{ id: MarkerId; at: number } | null>(null);
  const complete = host.scanned.length >= MARKER_IDS.length;
  const live = enabled && ar && !complete && !!model.detector && !!session?.canTapFrames;

  useEffect(() => {
    if (!live || !session || !model.detector) return;
    const detector = model.detector;
    const s = new CameraFrameScanner(
      detector,
      (frame) => {
        setSeeing(frame.sightings.map((x) => `${MARKER_LABEL[x.id]} ${Math.round((x.score ?? 0) * 100)}%`));
        const { host: h, hint: showHint } = latest.current;
        if (h.paused) return;
        const decision = decideFrame(scanCandidates(frame.sightings, detector.scanThresholds), h.scanned);
        if (decision.kind === "report") {
          const last = lastReport.current;
          if (last?.id === decision.scan.id && frame.at - last.at < REPORT_DEBOUNCE_MS) return;
          lastReport.current = { id: decision.scan.id, at: frame.at };
          h.onObjectScanned(decision.scan);
        } else if (decision.kind === "duplicate") showHint({ tone: "info", text: alreadyScannedText(decision.id) });
        else if (decision.kind === "crowded") showHint({ tone: "info", text: crowdedText(decision.ids) });
        else showHint(null);
      },
      { flipRows: FLIP_ROWS },
    );
    session.tapFrames((frame) => s.push(frame));
    setScanner(s);
    return () => {
      session.tapFrames(null);
      s.stop();
      setScanner(null);
      setSeeing([]);
    };
  }, [live, session, model.detector]);

  return {
    /** Detector loading state: idle | loading | slow | ready | failed. */
    model: model.status,
    retryModel: model.retry,
    live,
    supported: !!session?.canTapFrames,
    notice,
    justScanned,
    seeing,
    debugCanvas: scanner?.canvas ?? null,
  };
}
