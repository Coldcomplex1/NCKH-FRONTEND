/** Small scale helpers for the hand-built charts (no chart library). */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Maps `domain` linearly onto `range` (no clamping). A zero-width domain maps to the range start. */
export function linear(domain: readonly [number, number], range: readonly [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (v: number): number => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0))
}

/** Strip binary floating-point noise (0.1 + 0.2 → 0.3) from computed tick values. */
function clean(v: number): number {
  return Number.parseFloat(v.toPrecision(12))
}

/** A "nice" step (1, 2, 2.5 or 5 × 10^k) that splits `span` into about `count` intervals. */
export function niceStep(span: number, count = 5): number {
  if (!(span > 0) || count < 1) return 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return clean(nice * pow)
}

/** Nice domain covering [min, max] plus its ticks, e.g. (0.0840, 0.0912) → [0.082 … 0.092]. */
export function niceDomain(
  min: number,
  max: number,
  count = 5,
): { domain: [number, number]; ticks: number[] } {
  const step = niceStep(max - min, count)
  const lo = clean(Math.floor(min / step) * step)
  const hi = clean(Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(clean(v))
  return { domain: [lo, hi], ticks }
}

/** Evenly spaced ticks from `start` to `end` inclusive. */
export function rangeTicks(start: number, end: number, step: number): number[] {
  const out: number[] = []
  for (let v = start; v <= end + step / 2; v += step) out.push(clean(v))
  return out
}

/** Round `max` up to a nice number (used for 0-based bar scales). */
export function niceMax(max: number, count = 4): number {
  return niceDomain(0, max, count).domain[1]
}
