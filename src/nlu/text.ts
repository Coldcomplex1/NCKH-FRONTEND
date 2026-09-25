/**
 * Text primitives for Vietnamese: canonical tone placement, diacritic stripping, a phonetic key that
 * absorbs regional consonant mergers, and the pre-tokenization rewrites (units, operators, separators).
 */

const TONE = /[\u0300\u0301\u0303\u0309\u0323]/ // huyền sắc ngã hỏi nặng
const VOWELS = 'aăâeêioôơuưy'
const MARKED = 'ăâêôơư'

/**
 * Canonical ("old style") tone placement for one syllable: hoà→hòa, thuý→thúy, khoẻ→khỏe.
 * Lexicon strings pass through the same function, so the authoring style does not matter.
 */
export function canonSyl(s: string): string {
  if (!/\p{L}/u.test(s)) return s
  let tone = ''
  const base = [...s.normalize('NFD')]
    .filter((c) => {
      if (TONE.test(c)) {
        tone = c
        return false
      }
      return true
    })
    .join('')
    .normalize('NFC')
  if (!tone) return base
  const ch = [...base]
  let i = 0
  while (i < ch.length && !VOWELS.includes(ch[i]!)) i++
  // qu- and gi- onsets: the u / i belongs to the consonant
  if (
    i > 0 &&
    ((ch[i - 1] === 'q' && ch[i] === 'u') || (ch[i - 1] === 'g' && ch[i] === 'i')) &&
    VOWELS.includes(ch[i + 1] ?? '_')
  )
    i++
  let j = i
  while (j < ch.length && VOWELS.includes(ch[j]!)) j++
  if (i === j) return s.normalize('NFC')
  const vs = Array.from({ length: j - i }, (_, k) => i + k)
  const marked = vs.filter((k) => MARKED.includes(ch[k]!))
  const t =
    marked.length > 0
      ? marked[marked.length - 1]! // ươ→ơ, ưu→ư, iê→ê, uô→ô
      : j < ch.length
        ? vs[vs.length - 1]! // closed syllable: last vowel (hoàng, toán)
        : vs.length === 3
          ? vs[1]! // ngoài, khuỷu
          : vs[0]! // hòa, thúy, múa, mái
  ch[t] = (ch[t]! + tone).normalize('NFC')
  return ch.join('').normalize('NFC')
}

/** Remove all diacritics (đ → d). */
export const strip = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC')

/**
 * Phonetic key of a stripped syllable. Absorbs Southern v/d/gi/r, final n/ng and t/c, and tr/ch, s/x
 * (and the ASR errors those mergers cause). `kh` is never rewritten (critique fix: /^k(?!h)/).
 * The Northern l/n merger is deliberately not applied (scope cut: too many false matches).
 */
export const phoKey = (s: string): string =>
  s
    // Southern qu → w ("wạt" = quạt)
    .replace(/^w/, 'qu')
    // chat "f" for ph ("fút" = phút)
    .replace(/^f/, 'ph')
    .replace(/^ngh/, 'ng')
    .replace(/^gh/, 'g')
    .replace(/^gi(?=[aeiouy])/, 'd')
    .replace(/^tr/, 'ch')
    .replace(/^s/, 'x')
    .replace(/^[rvz]/, 'd')
    .replace(/^k(?!h)/, 'c')
    .replace(/^q/, 'c')
    .replace(/nh$/, 'n')
    .replace(/ng$/, 'n')
    .replace(/ch$/, 't')
    .replace(/c$/, 't')
    .replace(/([^aeiouy])y$/, '$1i')

/** Marker characters used by the tokenizer for sentence separators. */
export const SEP_MARK = '\u0001'
export const Q_MARK = '\u0002'
/** A comma: a soft break, merged back when the piece after it holds no command of its own. */
export const COMMA_MARK = '\u0003'

const OPS: Record<string, string> = {
  x: '*',
  '×': '*',
  '*': '*',
  '÷': '/',
  '/': '/',
  ':': '/',
  '+': '+',
  '-': '-',
  '=': '=',
}

/**
 * Unicode cleanup and pre-tokenization rewrites (spec §2 N1, N3). Case is preserved (it is recorded
 * per token before lower-casing). Returns a string whose whitespace-separated pieces are the raw tokens.
 */
export function preRewrite(input: string): string {
  let s = input.normalize('NFC')
  s = s
    .replace(/\u00D0/g, 'Đ')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    // a zero-width space separates words ("bật\u200Bđèn"); the joiners are formatting only
    .replace(/[\u00A0\u2007\u202F\u200B]/g, ' ')
    .replace(/\u200C|\u200D|\u2060|\uFEFF/g, '')
  // "TP.HCM", "Tp. Huế": the dot of the abbreviation is not a sentence break
  s = s.replace(/\btp\.\s*/giu, 'tp ')
  // clock-like and unit abbreviations next to digits
  s = s.replace(/(\d{1,2})[:h](\d{2})(?![\p{L}\p{N}])/giu, '$1 giờ $2')
  s = s.replace(/(\d{1,2})h(?![\p{L}\p{N}])/giu, '$1 giờ')
  s = s.replace(/(\d+)\s?(?:ph|p)(?![\p{L}\p{N}])/giu, '$1 phút')
  s = s.replace(/(\d+)'/gu, '$1 phút')
  s = s.replace(/(\d+)\s?s(?![\p{L}\p{N}])/giu, '$1 giây')
  // any other digit glued to a word is split off ("5phút", "3lần", "so3", "nhay3lan")
  s = s.replace(/(\d)(\p{L})/gu, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2')
  // a standalone "h" after a number is giờ ("1 h", "1h30p" → "1 h 30 phút")
  s = s.replace(/(\d)\s+h(?![\p{L}\p{N}])/giu, '$1 giờ')
  // thousands separators (1.000.000) then the Vietnamese decimal comma (2,5 → 2.5)
  s = s.replace(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?![\d.])/gu, (m) => m.replace(/\./g, ''))
  s = s.replace(/(\d),(\d)/gu, '$1.$2')
  // operators between digits (repeat for chains like 2+3+4)
  for (let k = 0; k < 4; k++) {
    const next = s.replace(/(\d)\s*([x×*÷/:+\-=])\s*(?=\d)/giu, (_m, d: string, op: string) => {
      return `${d} ${OPS[op.toLowerCase()] ?? op} `
    })
    if (next === s) break
    s = next
  }
  // a letter typed three or more times is one letter ("nhayyy", "lannn")
  s = s.replace(/(\p{L})\1{2,}/gu, '$1')
  // a hyphen between letters is a space ("Bà Rịa-Vũng Tàu", "rô-bốt")
  s = s.replace(/(\p{L})-(?=\p{L})/gu, '$1 ')
  // sentence separators; a dot between digits is a decimal point and stays
  s = s.replace(/\?/g, ` ${Q_MARK} `)
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, ` ${SEP_MARK} `)
  s = s.replace(/\s*,\s*(?=[^,;!…\n\r\t])/g, ` ${COMMA_MARK} `)
  s = s.replace(/[,;!…\n\r\t]+/g, ` ${SEP_MARK} `)
  // everything else outside letters, digits, spaces, operators and our markers is dropped
  s = s.replace(new RegExp(`[^\\p{L}\\p{N}\\s+\\-*/=.${SEP_MARK}${Q_MARK}${COMMA_MARK}]`, 'gu'), ' ')
  return s
}

/** Split the rewritten string into raw pieces (words, digits, operators, markers). */
export function rawPieces(rewritten: string): string[] {
  return rewritten.split(/\s+/).filter((p) => p.length > 0)
}

// ---- tones (tones are phonemic: "cháy" is not a typo of "chạy")

const TONE_MARKS: Record<string, string> = {
  '̀': 'huyen',
  '́': 'sac',
  '̃': 'nga',
  '̉': 'hoi',
  '̣': 'nang',
}

/** The tone of a syllable: '' (ngang), huyen, sac, hoi, nga, nang. */
export function toneOf(s: string): string {
  for (const c of s.normalize('NFD')) if (TONE_MARKS[c]) return TONE_MARKS[c]
  return ''
}

/** Tones that Central / Southern speech (and so ASR and spelling) merges: hỏi, ngã, nặng. */
export const toneClass = (tone: string): string =>
  tone === 'hoi' || tone === 'nga' || tone === 'nang' ? 'x' : tone

/** The syllable without its tone mark (vowel marks and đ kept): "vẫy" → "vây". */
export const baseOf = (s: string): string =>
  s.normalize('NFD').replace(new RegExp(TONE.source, 'g'), '').normalize('NFC')

const ONSET =
  /^(ngh|ng|gh|gi(?=[aăâeêioôơuưy])|qu(?=[aăâeêioôơuưy])|ch|kh|nh|ph|th|tr|[bcdđfghjklmnpqrstvwxz])?/

/** The vowel nucleus of a toneless syllable: "giêt" → "ê", "quat" → "a", "dây" → "ây". */
export function nucleusOf(base: string): string {
  const rest = base.replace(ONSET, '')
  const m = /^[aăâeêioôơuưy]+/.exec(rest)
  return m ? m[0] : ''
}
