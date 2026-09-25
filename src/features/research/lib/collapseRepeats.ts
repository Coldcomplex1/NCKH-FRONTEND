/**
 * Shrinks ASR "repetition loops" (a hallucinating decoder emitting the same 1–4 words dozens of times)
 * into one segment, so the worst examples stay readable: "ủng hộ ủng hộ … ủng hộ" → `ủng hộ ×25`.
 * Short natural repeats ("rất rất", "đi đi đi") stay as written because a run must reach `minRun`.
 */

export type Segment =
  | { kind: 'text'; tokens: string[] }
  /** `unit` is the repeated n-gram as first written (edge punctuation trimmed); `count` ≥ minRun. */
  | { kind: 'repeat'; unit: string[]; count: number }

export interface CollapseOptions {
  /** Longest repeated n-gram to look for. */
  maxN?: number
  /** Minimum consecutive repetitions for a run to collapse. */
  minRun?: number
}

const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu

/** Trim leading/trailing punctuation ("hộ," → "hộ"). */
export function trimPunct(token: string): string {
  return token.replace(EDGE_PUNCT, '')
}

/** Comparison key: case- and edge-punctuation-insensitive, so "hộ," matches "hộ". */
function keyOf(token: string): string {
  return trimPunct(token).toLocaleLowerCase('vi')
}

export function tokenize(text: string): string[] {
  return text.split(/\s+/u).filter(Boolean)
}

export function collapseRepeats(tokens: readonly string[], opts: CollapseOptions = {}): Segment[] {
  const maxN = opts.maxN ?? 4
  const minRun = opts.minRun ?? 5
  const keys = tokens.map(keyOf)
  const len = tokens.length

  /** Do the n-grams starting at a and b match? (Tokens that are pure punctuation never match.) */
  const same = (a: number, b: number, n: number): boolean => {
    for (let k = 0; k < n; k++) {
      const ka = keys[a + k]
      if (!ka || ka !== keys[b + k]) return false
    }
    return true
  }

  const out: Segment[] = []
  let text: string[] = []
  const flush = () => {
    if (text.length) out.push({ kind: 'text', tokens: text })
    text = []
  }

  let i = 0
  while (i < len) {
    // Pick the n-gram length that covers the most tokens from position i (smaller n wins ties).
    let bestN = 0
    let bestCount = 0
    for (let n = 1; n <= maxN && i + n * minRun <= len; n++) {
      let count = 1
      while (i + (count + 1) * n <= len && same(i, i + count * n, n)) count++
      if (count >= minRun && count * n > bestCount * bestN) {
        bestN = n
        bestCount = count
      }
    }
    if (bestN > 0) {
      flush()
      out.push({ kind: 'repeat', unit: tokens.slice(i, i + bestN).map(trimPunct), count: bestCount })
      i += bestN * bestCount
    } else {
      text.push(tokens[i]!)
      i++
    }
  }
  flush()
  return out
}

/** Words a segment list shows (a collapsed run shows its unit once). */
export function visibleWords(segments: readonly Segment[]): number {
  return segments.reduce((n, s) => n + (s.kind === 'text' ? s.tokens.length : s.unit.length), 0)
}

/**
 * Cut a segment list after `maxWords` visible words. Returns the kept segments and whether anything
 * was cut. A collapsed run is never split: it is kept whole or dropped.
 */
export function truncateSegments(
  segments: readonly Segment[],
  maxWords: number,
): { segments: Segment[]; truncated: boolean } {
  const kept: Segment[] = []
  let left = maxWords
  for (const s of segments) {
    if (left <= 0) return { segments: kept, truncated: true }
    if (s.kind === 'text') {
      if (s.tokens.length > left) {
        kept.push({ kind: 'text', tokens: s.tokens.slice(0, left) })
        return { segments: kept, truncated: true }
      }
      kept.push(s)
      left -= s.tokens.length
    } else {
      if (s.unit.length > left) return { segments: kept, truncated: true }
      kept.push(s)
      left -= s.unit.length
    }
  }
  return { segments: kept, truncated: false }
}
