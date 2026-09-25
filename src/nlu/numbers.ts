/**
 * Vietnamese number words (spec §2 N11). Number tagging never deletes tokens: a run such as
 * "hai mươi mốt" is marked as one number (value 21) and the words stay, so phrases like
 * "nhảy một bài" still match literally.
 */

const UNITS: Record<string, number> = {
  không: 0,
  một: 1,
  mốt: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  lăm: 5,
  nhăm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
}
const SCALES: [readonly string[], number][] = [
  [['tỷ', 'tỉ'], 1e9],
  [['triệu'], 1e6],
  [['nghìn', 'ngàn'], 1e3],
  [['trăm'], 100],
  // "hai chục" = 20, "chục phút" = 10 (Southern colloquial)
  [['chục'], 10],
]

const unit = (w: string): number => (/^\d+(\.\d+)?$/.test(w) ? Number(w) : (UNITS[w] ?? Number.NaN))

/** Evaluate a run of (canonical, accented) number words. NaN when it is not a well-formed number. */
export function evalNum(ws: readonly string[]): number {
  if (ws.length === 0) return Number.NaN
  for (const [names, sc] of SCALES) {
    const k = ws.findIndex((w) => names.includes(w))
    if (k < 0) continue
    const left = k > 0 ? evalNum(ws.slice(0, k)) : 1
    const right = ws.slice(k + 1)
    if (right.length === 0) return left * sc
    if (right.length === 1 && right[0] === 'rưỡi') return left * sc + sc / 2 // hai trăm rưỡi
    // "hai trăm mốt" = 210, "nghìn hai" = 1200
    if (
      right.length === 1 &&
      !Number.isNaN(unit(right[0]!)) &&
      !/^\d/.test(right[0]!) &&
      right[0] !== 'không'
    )
      return left * sc + (unit(right[0]!) * sc) / 10
    if (right[0] === 'linh' || right[0] === 'lẻ') {
      const r = evalNum(right.slice(1))
      return r < 10 ? left * sc + r : Number.NaN
    }
    return left * sc + evalNum(right)
  }
  if (ws[0] === 'mười') {
    if (ws.length === 1) return 10
    if (ws.length === 2) return 10 + unit(ws[1]!)
    return Number.NaN
  }
  if (ws.length === 1) return unit(ws[0]!)
  // "hai mười" (ASR / typing confusion) is hai mươi; "chín mười" stays a range (9–10)
  const tensWord = ws[1] === 'mươi' || (ws[1] === 'mười' && unit(ws[0]!) >= 2 && unit(ws[0]!) <= 8)
  if (tensWord) {
    const tens = unit(ws[0]!) * 10
    if (ws.length === 2) return tens
    if (ws.length === 3) return tens + unit(ws[2]!)
    return Number.NaN
  }
  // colloquial tens: "hai lăm" = 25, "ba tư" = 34
  if (ws.length === 2 && ['mốt', 'tư', 'lăm', 'nhăm'].includes(ws[1]!))
    return unit(ws[0]!) * 10 + unit(ws[1]!)
  return Number.NaN
}

/** Words that are always numbers (in accented input). */
const SCALE_WORDS = new Set(['trăm', 'nghìn', 'ngàn', 'triệu', 'tỷ', 'tỉ', 'chục'])
const STRONG = new Set([
  'chục',
  'một',
  'hai',
  'ba',
  'bốn',
  'sáu',
  'bảy',
  'tám',
  'chín',
  'mười',
  'mươi',
  'trăm',
  'nghìn',
  'triệu',
  'tỷ',
  'tỉ',
])
/** Words that are numbers only in numeric context. */
const WEAK = new Set(['năm', 'tư', 'mốt', 'lăm', 'nhăm', 'không', 'linh', 'lẻ', 'rưỡi'])

/** No-diacritics spellings → canonical number word. `weak` = also an ordinary word. */
const ASCII_NUM: Record<string, { w: string; weak: boolean }> = {
  mot: { w: 'một', weak: false },
  hai: { w: 'hai', weak: false },
  ba: { w: 'ba', weak: false },
  bon: { w: 'bốn', weak: true },
  nam: { w: 'năm', weak: true },
  sau: { w: 'sáu', weak: true },
  bay: { w: 'bảy', weak: true },
  tam: { w: 'tám', weak: true },
  chin: { w: 'chín', weak: false },
  muoi: { w: 'mười', weak: true },
  tram: { w: 'trăm', weak: true },
  nghin: { w: 'nghìn', weak: false },
  trieu: { w: 'triệu', weak: false },
  ty: { w: 'tỷ', weak: true },
  tu: { w: 'tư', weak: true },
  lam: { w: 'lăm', weak: true },
  linh: { w: 'linh', weak: true },
  le: { w: 'lẻ', weak: true },
  ruoi: { w: 'rưỡi', weak: true },
  khong: { w: 'không', weak: true },
  chuc: { w: 'chục', weak: true },
}

/**
 * Every canonical number word. The tagger treats them as known words, so a number is never
 * "corrected" into a look-alike lexicon word (mười → mời, tám → tắm, bảy → bay, lăm → lam).
 */
export const NUMBER_WORDS: readonly string[] = [
  ...new Set([...Object.keys(UNITS), ...STRONG, ...WEAK, 'rưỡi', 'ngàn']),
]

/** Units and words that give a weak number word numeric context. */
const CONTEXT = new Set([
  'lần',
  'cái',
  'phát',
  'bận',
  'lượt',
  'cú',
  'nhát',
  'vòng',
  'bước',
  'giây',
  'phút',
  'giờ',
  'tiếng',
  'bằng',
  'số',
  'thứ',
  'phần',
  'mùng',
  'mức',
  'nấc',
  'độ',
  'tuổi',
  'bài',
  'ngày',
  'tháng',
  'trừ',
  'cộng',
  'nhân',
  'nhơn',
  'chia',
  'lần',
  'quả',
  'trái',
])
/** Spoken and symbolic operators ("5 nhân không" = 5 × 0). */
const OP_WORDS = new Set(['cộng', 'trừ', 'nhân', 'nhơn', 'chia'])
const OP_STRIPS = new Set(['cong', 'tru', 'nhan', 'nhon', 'chia'])
const isOpWord = (t: NumToken | undefined): boolean =>
  !!t && (t.isOp || OP_WORDS.has(t.text) || (t.ascii && OP_STRIPS.has(t.strip)))

const NAM_NOT_BEFORE = new Set([
  'nay',
  'ngoái',
  'sau',
  'tới',
  'mới',
  'con',
  'âm',
  'dương',
  'nhuận',
  'học',
  'gì',
  'trước',
  'kia',
])
const NAM_NOT_AFTER = new Set(['trong', 'mỗi', 'cả', 'hàng', 'các', 'những', 'bao', 'nhiều', 'mấy'])

export interface NumToken {
  text: string
  strip: string
  ascii: boolean
  isOp: boolean
}

export interface NumRun {
  start: number
  /** exclusive */
  end: number
  value: number
  /** Canonical number words of the run (digits as typed), e.g. ["hai", "mươi", "mốt"]. */
  words: string[]
}

type Mode = 'accented' | 'ascii'

/**
 * The number word a token stands for. Diacritic-free spellings count as numbers only in
 * no-diacritics input: in accented text "sau" is "after", "bay" is "fly" and "nam" is "south",
 * never sáu / bảy / năm (only the unambiguous "mot", "chin", "nghin", "trieu" are still read).
 */
function candidate(t: NumToken, mode: Mode): { w: string; strong: boolean } | null {
  if (/^\d+(\.\d+)?$/.test(t.text)) return { w: t.text, strong: true }
  if (STRONG.has(t.text)) return { w: t.text, strong: true }
  if (WEAK.has(t.text)) return { w: t.text, strong: false }
  if (t.ascii) {
    const a = ASCII_NUM[t.strip]
    if (a && (mode === 'ascii' || !a.weak)) return { w: a.w, strong: !a.weak }
  }
  return null
}

/** Units after which a leading no-diacritics "sau" means "after" ("sau muoi phut" = in 10 minutes). */
const AFTER_UNITS = new Set(['giây', 'phút', 'giờ', 'tiếng', 'bước', 'ngày', 'tuần', 'tháng'])
const AFTER_UNIT_STRIPS = new Set([...AFTER_UNITS].map((w) => stripLite(w)))
const isAfterUnit = (t: NumToken | undefined): boolean =>
  !!t && (AFTER_UNITS.has(t.text) || (t.ascii && AFTER_UNIT_STRIPS.has(t.strip)))

/** Approximate ranges are two neighbouring numbers: "hai ba lần" (2–3), "năm sáu phút" (5–6). */
function rangeValue(ws: readonly string[]): number {
  if (ws.length !== 2 || ws.some((w) => /^\d/.test(w))) return Number.NaN
  const [a, b] = ws.map(unit) as [number, number]
  return b === a + 1 && a >= 1 ? b : Number.NaN
}

const isContextWord = (t: NumToken | undefined): boolean =>
  !!t && (t.isOp || CONTEXT.has(t.text) || (t.ascii && [...CONTEXT].some((c) => stripLite(c) === t.strip)))

/** Verbs that take a bare count right after them ("nhảy năm" = jump five times). */
const COUNT_VERBS = new Set(['nhảy', 'vẫy', 'gật', 'đấm'])
const isCountVerb = (t: NumToken | undefined): boolean => !!t && COUNT_VERBS.has(t.text)

function stripLite(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/g, 'd')
}

/**
 * Find number runs in a token list. A run of only weak words (e.g. "năm", "không", ASCII "sau")
 * needs numeric context: an adjacent unit, operator, "bằng", "số", "thứ" …
 * `mode` is the input mode (inferred from the tokens when omitted): diacritic-free number
 * spellings are read only in no-diacritics input.
 */
export function findNumberRuns(
  toks: readonly NumToken[],
  blocked?: readonly boolean[],
  mode: Mode = toks.some((t) => /\p{L}/u.test(t.text) && !t.ascii) ? 'accented' : 'ascii',
): NumRun[] {
  const cand = (k: number): { w: string; strong: boolean } | null => candidate(toks[k]!, mode)
  /** Canonical words of toks[s, e): no-diacritics "muoi" is mươi after a unit ("hai muoi" = 20). */
  const wordsOf = (s: number, e: number): string[] => {
    const ws: string[] = []
    for (let k = s; k < e; k++) {
      const w = cand(k)!.w
      const prev = ws[ws.length - 1]
      ws.push(w === 'mười' && toks[k]!.ascii && prev !== undefined && !SCALE_WORDS.has(prev) ? 'mươi' : w)
    }
    return ws
  }
  const valueOf = (ws: readonly string[]): number => {
    const v = evalNum(ws)
    return Number.isNaN(v) ? rangeValue(ws) : v
  }
  /** One run for toks[s, e), or its longest well-formed pieces ("sáu mười lăm" = 6 | 15). */
  const evaluate = (s: number, e: number, out: NumRun[]): void => {
    if (s >= e) return
    for (let k = e; k > s; k--) {
      const ws = wordsOf(s, k)
      const value = valueOf(ws)
      if (Number.isNaN(value)) continue
      const anyStrong = ws.some((_, x) => cand(s + x)!.strong)
      const ctx = isContextWord(toks[s - 1]) || isContextWord(toks[k]) || isCountVerb(toks[s - 1])
      if (anyStrong || ctx) out.push({ start: s, end: k, value, words: ws })
      evaluate(k, e, out)
      return
    }
    evaluate(s + 1, e, out)
  }

  const runs: NumRun[] = []
  let i = 0
  while (i < toks.length) {
    if (blocked?.[i] || !cand(i)) {
      i++
      continue
    }
    let j = i
    let last = ''
    while (j < toks.length && blocked?.[j] !== true) {
      const c = cand(j)
      if (!c) break
      if (j > i) {
        // "5 3" is two numbers; a digit only continues with a scale word ("5 nghìn")
        if (/^\d/.test(c.w)) break
        if (/^\d/.test(last) && !SCALE_WORDS.has(c.w)) break
      }
      last = c.w
      j++
    }
    // trim leading/trailing weak words that are clearly not numbers
    let s = i
    let e = j
    const okWeak = (k: number): boolean => {
      const w = cand(k)!.w
      if (w === 'năm') {
        const next = toks[k + 1]
        const prev = toks[k - 1]
        if (next && (NAM_NOT_BEFORE.has(next.text) || /^\d{4}$/.test(next.text))) return false
        if (next && next.ascii && [...NAM_NOT_BEFORE].some((n) => stripLite(n) === next.strip)) return false
        // "trong năm phút" = within five minutes: a unit right after wins over "trong năm" (this year)
        if (isContextWord(next)) return true
        if (prev && NAM_NOT_AFTER.has(prev.text)) return false
      }
      if (w === 'không') {
        // "không" is a number only next to an operator/"bằng" or inside a longer run
        const prev = toks[k - 1]
        const next = toks[k + 1]
        const nearOp = isOpWord(prev) || prev?.text === 'bằng' || isOpWord(next)
        return !!nearOp || e - s > 1
      }
      return true
    }
    while (s < e && !cand(s)!.strong && !okWeak(s)) s++
    while (e > s && !cand(e - 1)!.strong && !okWeak(e - 1)) e--
    // no-diacritics "sau" before "<number> <unit>" means "after": "sau muoi phut" = in 10 minutes
    if (e - s >= 2 && toks[s]!.ascii && toks[s]!.strip === 'sau' && isAfterUnit(toks[e])) s++
    evaluate(s, e, runs)
    i = Math.max(j, i + 1)
  }
  return runs
}
