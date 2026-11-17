import type { SessionPreset } from './types'

/** Presets taken from the IncomeSharks charts he posted for those sessions. */
export const SESSION_PRESETS: SessionPreset[] = [
  {
    id: '2026-11-17',
    label: 'Nov 17 · PUT → $735 gamma',
    dateKey: '2026-11-17',
    callWall: 742,
    putWall: 735,
    gammaRegime: 'Negative Gamma',
    note: 'Shark prints PUT, shared Slice entry, targets the $735 put wall in under 30 minutes.',
  },
  {
    id: '2026-11-16',
    label: 'Nov 16 · Whale at $740',
    dateKey: '2026-11-16',
    callWall: 753,
    putWall: 740,
    gammaRegime: 'Negative Gamma',
    note: 'PUT after weekly-open break; whale target printed into the $740 gamma pocket.',
  },
]
