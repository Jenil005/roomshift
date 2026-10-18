import { useCallback, useEffect, useRef, useState } from "react";
import {
  addedScans,
  CHECKLIST_ORDER,
  CLUE_LABEL,
  SIGNAL_SAVING_TEXT,
  signalVerifiedText,
} from "./scan/objectScan";
import { MARKER_IDS, type MarkerId, type ScanNotice } from "./types";

// A scan confirmation stays up this long before a duplicate or framing hint may replace it.
export const SCAN_NOTICE_HOLD_MS = 2_500;
const JUST_SCANNED_MS = 900;
const NONE: readonly MarkerId[] = [];

export type ScanItemState = "accepted" | "pending" | "waiting";

/** Checklist state of one object: green only once accepted (scanned and no longer queued). */
export function scanItemState(
  id: MarkerId,
  scanned: readonly MarkerId[],
  pending: readonly MarkerId[] = NONE,
): ScanItemState {
  if (!scanned.includes(id)) return "waiting";
  return pending.includes(id) ? "pending" : "accepted";
}

/**
 * Status line for sequential scanning. `scanned` is the shared progress (this phone's queued
 * scans plus everything accepted, a teammate's included) and `pending` the queued part. A
 * newly queued object shows "SIGNAL DETECTED — SAVING…"; once accepted, "SIGNAL VERIFIED —
 * k/3" for SCAN_NOTICE_HOLD_MS. Neither names the next object. `hint` shows lower-priority
 * lines (duplicates, framing) only when nothing more important is up. A host notice (a
 * server verdict) always wins.
 */
export function useScanNotices(
  scanned: readonly MarkerId[],
  hostNotice: ScanNotice | null | undefined,
  pending: readonly MarkerId[] = NONE,
) {
  const [local, setLocal] = useState<{ notice: ScanNotice; until: number } | null>(null);
  const [justScanned, setJustScanned] = useState<MarkerId | null>(null);
  const previous = useRef({
    scanned,
    accepted: scanned.filter((id) => !pending.includes(id)),
  });

  useEffect(() => {
    const accepted = scanned.filter((id) => !pending.includes(id));
    const before = previous.current;
    previous.current = { scanned, accepted };
    const detected = addedScans(before.scanned, scanned).at(-1);
    const verified = addedScans(before.accepted, accepted).at(-1);
    if (verified) {
      setLocal({
        notice: { tone: "success", text: signalVerifiedText(accepted.length) },
        until: performance.now() + SCAN_NOTICE_HOLD_MS,
      });
      setJustScanned(verified);
    } else if (detected) {
      setLocal({
        notice: { tone: "info", text: SIGNAL_SAVING_TEXT },
        until: performance.now() + SCAN_NOTICE_HOLD_MS,
      });
    }
    if (detected) {
      try {
        navigator.vibrate?.(35); // optional haptic; unsupported on iOS Safari
      } catch {
        // ignore
      }
    }
  }, [scanned, pending]);

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

/** Checklist wording per state, shared with the facility HUD. */
export const SCAN_ITEM_TEXT: Record<ScanItemState, string> = {
  accepted: "SCANNED",
  pending: "SAVING…",
  waiting: "NOT SCANNED",
};
export const SCAN_ITEM_SPOKEN: Record<ScanItemState, string> = {
  accepted: "scanned",
  pending: "saving, not confirmed yet",
  waiting: "not scanned",
};
export const SCAN_ITEM_MARK: Record<ScanItemState, string> = { accepted: "✓", pending: "◌", waiting: "○" };

/**
 * The scan checklist: one item per object, labelled with its clue word in the fixed
 * CHECKLIST_ORDER (never the solution order), k/3 progress, the status line and an
 * optional restart.
 */
export function ScanProgress({
  scanned,
  pending = NONE,
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
  const accepted = scanned.filter((id) => !pending.includes(id)).length;
  const saving = scanned.length - accepted;
  const total = MARKER_IDS.length;
  return (
    <div className="scan-feedback scan-progress">
      <p
        className={`ai-headline scan-notice ${notice ? `is-${notice.tone}` : ""}`}
        aria-live="polite"
      >
        {notice?.text ?? idleText}
      </p>
      {/* An unordered list: the item order is not the scan order. */}
      <ul className="marker-list scan-list" aria-label="Scan checklist">
        {CHECKLIST_ORDER.map((id) => {
          const state = scanItemState(id, scanned, pending);
          return (
            <li
              key={id}
              className={`marker-chip scan-chip is-${state === "accepted" ? "scanned" : state} ${justScanned === id ? "just-scanned" : ""}`}
              aria-label={`${CLUE_LABEL[id]}: ${SCAN_ITEM_SPOKEN[state]}`}
              data-state={state}
            >
              <span className="scan-check" aria-hidden="true">
                {SCAN_ITEM_MARK[state]}
              </span>
              <span className="scan-clue">{CLUE_LABEL[id]}</span>
              <em>{SCAN_ITEM_TEXT[state]}</em>
            </li>
          );
        })}
      </ul>
      <div
        className="progress-track scan-track"
        role="progressbar"
        aria-label="Signals verified"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={accepted}
        aria-valuetext={`${accepted} of ${total} verified${saving ? `, ${saving} saving` : ""}`}
      >
        <div style={{ width: `${(accepted / total) * 100}%` }} />
        {saving > 0 && (
          <div
            className="scan-track-pending"
            style={{ width: `${(saving / total) * 100}%` }}
          />
        )}
      </div>
      <p className="scan-count">
        PROGRESS {accepted}/{total}
        {saving > 0 && ` · ${saving} SAVING`}
      </p>
      {onRestart && scanned.length > 0 && (
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
