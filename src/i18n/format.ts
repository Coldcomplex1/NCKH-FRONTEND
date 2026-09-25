import { LOCALE, type Lang } from '@/core/lang'

/**
 * Number formatting — ALWAYS go through these (never toFixed): Intl rounds half-away-from-zero
 * (7.475 → "7,48"), uses the decimal comma in Vietnamese and the right grouping separators.
 */
export interface Fmt {
  /** fraction → percent string: pct(0.0784) = "7,84%" (vi) / "7.84%" (en) */
  pct(fraction: number, digits?: number): string
  /** Percentage points between two fractions. */
  pp(deltaFraction: number, digits?: number): string
  int(n: number): string
  num(n: number, digits?: number): string
  /** Up to `maxDigits` decimals, trailing zeros dropped (math results). */
  numFlex(n: number, maxDigits?: number): string
}

const cache = new Map<string, Intl.NumberFormat>()
function nf(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = lang + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], opts)
    cache.set(key, f)
  }
  return f
}

export function makeFmt(lang: Lang): Fmt {
  return {
    pct: (x, digits = 2) =>
      nf(lang, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x),
    pp: (x, digits = 2) =>
      `${nf(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x * 100)} ${lang === 'vi' ? 'điểm %' : 'pp'}`,
    int: (n) => nf(lang, { maximumFractionDigits: 0 }).format(n),
    num: (n, digits = 2) =>
      nf(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
    numFlex: (n, maxDigits = 4) => nf(lang, { maximumFractionDigits: maxDigits }).format(n),
  }
}
