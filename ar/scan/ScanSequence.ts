import type { MarkerId } from "../types";

export const SCAN_DEBOUNCE_MS = 1500;

/**
 * Ignores a tag for SCAN_DEBOUNCE_MS after it was last seen, so a card that stays in view
 * counts once. It is re-armed only after it has been out of view for the full window.
 */
export class ScanDebouncer {
  private lastSeen = new Map<MarkerId, number>();

  private windowMs: number;

  constructor(windowMs = SCAN_DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  /** True when this sighting counts as a new scan. */
  accept(id: MarkerId, now: number): boolean {
    const previous = this.lastSeen.get(id);
    this.lastSeen.set(id, now);
    return previous === undefined || now - previous >= this.windowMs || now < previous;
  }

  reset() {
    this.lastSeen.clear();
  }
}

/**
 * The order objects were scanned in, for `puzzle:submit` (`scanned`). Each object appears
 * once, because the server rejects duplicates. Local feedback only: the server decides.
 */
export class ScanSequence {
  private ids: MarkerId[] = [];

  /** Adds the id if it is not already in the sequence. Returns whether it was added. */
  append(id: MarkerId): boolean {
    if (this.ids.includes(id)) return false;
    this.ids.push(id);
    return true;
  }

  clear() {
    this.ids = [];
  }

  current(): MarkerId[] {
    return [...this.ids];
  }
}
