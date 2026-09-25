/**
 * Mark colours for charts. `series-1`/`series-2` are the two data series (validation / test …);
 * `north`/`central`/`south` are RESERVED for the ViMD regions; `success` marks the "perfect" bin.
 * Text never wears these colours — labels and values stay in ink/muted.
 */
export type Tone = 'series-1' | 'series-2' | 'north' | 'central' | 'south' | 'success' | 'muted'

export const TONE_BG: Record<Tone, string> = {
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  north: 'bg-north',
  central: 'bg-central',
  south: 'bg-south',
  success: 'bg-success',
  muted: 'bg-line-strong',
}
