import { useCallback, useEffect, useRef, useState } from "react";
import { addedScans, scannedText } from "./scan/objectScan";
import {
  MARKER_IDS,
  MARKER_LABEL,
  type MarkerId,
  type ScanNotice,
} from "./types";

// A scan confirmation stays up this long before a duplicate or framing hint may replace it.
export const SCAN_NOTICE_HOLD_MS = 2_500;
const JUST_SCANNED_MS = 900;

/**
 * Status line for sequential scanning. A newly scanned object (from this phone or a
 * teammate's, since `scanned` is the shared progress) shows "BOOK SCANNED ✓ — FIND THE CUP"
 * for SCAN_NOTICE_HOLD_MS; `hint` shows lower-priority lines (duplicates, framing) only when
 * nothing more important is up. A host notice (a server verdict) always wins.
 */
export function useScanNotices(
  scanned: readonly MarkerId[],
  hostNotice: ScanNotice | null | undefined,
) {
  const [local, setLocal] = useState<{ notice: ScanNotice; until: number } | null>(null);
  const [justScanned, setJustScanned] = useState<MarkerId | null>(null);
  const previous = useRef<readonly MarkerId[]>(scanned);

  useEffect(() => {
    const added = addedScans(previous.current, scanned);
    previous.current = scanned;
    const newest = added.at(-1);
    if (!newest) return;
    setLocal({
      notice: { tone: "success", text: scannedText(newest, scanned) },
      until: performance.now() + SCAN_NOTICE_HOLD_MS,
    });
    setJustScanned(newest);
    try {
      navigator.vibrate?.(35); // optional haptic; unsupported on iOS Safari
    } catch {
      // ignore
    }
  }, [scanned]);

  useEffect(() => {
    if (!justScanned) return;
    const timer = window.setTimeout(() => setJustScanned(null), JUST_SCANNED_MS);
    return () => clearTimeout(timer);
  }, [justScanned]);

  const hint = useCallback((notice: ScanNotice | null) => {
    setLocal((current) => {
      if (current && performance.now() < current.until) return current;
      if (!notice) return current && current.notice.tone === "success" ? current : null;
      if (current?.notice.text === notice.text) return current; // no re-render per frame
      return { notice, until: 0 };
    });
  }, []);

  return { notice: hostNotice ?? local?.notice ?? null, hint, justScanned };
}

/** Three object indicators, k/3 progress, the status line and an optional restart. */
export function ScanProgress({
  scanned,
  pending = [],
  notice,
  idleText,
  justScanned,
  onRestart,
  restartDisabled,
}: {
  scanned: readonly MarkerId[];
  pending?: readonly MarkerId[];
  notice: ScanNotice | null;
  idleText: string;
  justScanned?: MarkerId | null;
  onRestart?: () => void;
  restartDisabled?: boolean;
}) {
  const count = scanned.length;
  return (
    <div className="scan-feedback scan-progress">
      <p
        className={`ai-headline scan-notice ${notice ? `is-${notice.tone}` : ""}`}
        aria-live="polite"
      >
        {notice?.text ?? idleText}
      </p>
      <ol className="marker-list scan-list" aria-label="Scanned objects">
        {MARKER_IDS.map((id) => {
          const done = scanned.includes(id);
          const saving = done && pending.includes(id);
          return (
            <li
              key={id}
              className={`marker-chip scan-chip ${done ? "is-scanned" : "is-waiting"} ${justScanned === id ? "just-scanned" : ""}`}
              aria-label={`${MARKER_LABEL[id]}: ${done ? "scanned" : "not scanned"}`}
            >
              <span className="scan-check" aria-hidden="true">
                {done ? "✓" : "○"}
              </span>
              {MARKER_LABEL[id]}
              <em>{done ? (saving ? "SCANNED · SAVING" : "SCANNED") : "NOT SCANNED"}</em>
            </li>
          );
        })}
      </ol>
      <div
        className="progress-track scan-track"
        role="progressbar"
        aria-label="Objects scanned"
        aria-valuemin={0}
        aria-valuemax={MARKER_IDS.length}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${MARKER_IDS.length} scanned`}
      >
        <div style={{ width: `${(count / MARKER_IDS.length) * 100}%` }} />
      </div>
      <p className="scan-count">
        PROGRESS {count}/{MARKER_IDS.length}
      </p>
      {onRestart && count > 0 && (
        <button
          type="button"
          className="text-button"
          onClick={onRestart}
          disabled={restartDisabled}
        >
          Restart scanning
        </button>
      )}
    </div>
  );
}
