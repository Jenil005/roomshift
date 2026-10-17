/**
 * Static narration for every phase. Always shown first; Gemini may replace it with a
 * fresher line for the same phase. The game never depends on Gemini.
 */

import type { GamePhase } from '@shared/types'

export const FALLBACK_NARRATION: Record<GamePhase, string> = {
  LOBBY: 'Facility blackout detected. Assemble your team and stand by.',
  READY: 'All operatives ready. Awaiting the command to begin.',
  INTRO: 'The power is gone and lockdown is coming. Restore the facility before it seals for good.',
  PUZZLE_1: 'The breaker panel is dark. Arrange the three objects the way your briefings describe.',
  PUZZLE_1_COMPLETE: 'Breaker engaged. Emergency power is flowing.',
  PUZZLE_2: 'The comms terminal is waking. Pool your maintenance notes and set the boot order.',
  PUZZLE_2_COMPLETE: 'Comms online. The blast door controller is responding.',
  FINAL_SEQUENCE: 'Blast door override armed. Everyone hold together.',
  COMPLETE: 'Power restored. Lockdown disabled. Mission complete.',
}

/** Phases worth a Gemini call. Lobby ready-toggling would otherwise burn requests. */
export const GEMINI_PHASES: ReadonlySet<GamePhase> = new Set([
  'INTRO',
  'PUZZLE_1',
  'PUZZLE_1_COMPLETE',
  'PUZZLE_2',
  'PUZZLE_2_COMPLETE',
  'FINAL_SEQUENCE',
  'COMPLETE',
])
