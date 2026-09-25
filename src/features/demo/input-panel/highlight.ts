import type { Substitution } from '@/core/parser'

export interface TextSegment {
  text: string
  /** Set when this segment is the `to` side of a substitution. */
  sub?: Substitution
}

/**
 * Split `normalizedText` into plain and highlighted segments using the substitutions' character
 * offsets (end exclusive). Offsets that are out of range, empty or overlapping an earlier
 * substitution are ignored instead of throwing, so a parser bug can never break the UI.
 */
export function highlightSegments(text: string, subs: readonly Substitution[]): TextSegment[] {
  const valid = subs
    .filter(
      (s) =>
        Number.isInteger(s.start) &&
        Number.isInteger(s.end) &&
        s.start >= 0 &&
        s.end > s.start &&
        s.end <= text.length,
    )
    .slice()
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const out: TextSegment[] = []
  let pos = 0
  for (const sub of valid) {
    if (sub.start < pos) continue // overlaps the previous highlight
    if (sub.start > pos) out.push({ text: text.slice(pos, sub.start) })
    out.push({ text: text.slice(sub.start, sub.end), sub })
    pos = sub.end
  }
  if (pos < text.length) out.push({ text: text.slice(pos) })
  return out
}

/** Substitutions worth listing, de-duplicated by from→to (e.g. "rứa → vậy" once). */
export function uniqueSubstitutions(subs: readonly Substitution[]): Substitution[] {
  const seen = new Set<string>()
  const out: Substitution[] = []
  for (const s of subs) {
    const key = `${s.kind}|${s.from}|${s.to}`
    if (s.from === s.to || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}
