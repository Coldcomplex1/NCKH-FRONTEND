import { describe, expect, it } from 'vitest'
import { detectMode, rewriteSentences, tokenize } from '../normalize'
import { canonSyl, phoKey, preRewrite, Q_MARK, SEP_MARK, strip } from '../text'

describe('canonSyl (old-style tone placement)', () => {
  it.each([
    ['hoà', 'hòa'],
    ['thuý', 'thúy'],
    ['khoẻ', 'khỏe'],
    ['huỷ', 'hủy'],
    ['quá', 'quá'],
    ['già', 'già'],
    ['người', 'người'],
    ['rượu', 'rượu'],
    ['hoàng', 'hoàng'],
    ['toán', 'toán'],
    ['ngoài', 'ngoài'],
    ['khuỷu', 'khuỷu'],
    ['nhảy', 'nhảy'],
    ['giữ', 'giữ'],
  ])('%s → %s', (a, b) => {
    expect(canonSyl(a.normalize('NFD').normalize('NFC'))).toBe(b)
  })
})

describe('strip / phoKey', () => {
  it('strips diacritics and đ', () => {
    expect(strip('Đà Nẵng')).toBe('Da Nang')
    expect(strip('nhảy múa')).toBe('nhay mua')
  })

  it('absorbs regional consonant mergers', () => {
    expect(phoKey('trạy'.normalize('NFD').replace(/[̀-ͯ]/g, ''))).toBe(phoKey('chay'))
    expect(phoKey('sin')).toBe(phoKey('xin'))
    expect(phoKey('dẫy'.normalize('NFD').replace(/[̀-ͯ]/g, ''))).toBe(phoKey('vay'))
    expect(phoKey('tac')).toBe(phoKey('tat'))
    expect(phoKey('quac')).toBe(phoKey('quat'))
  })

  it('never rewrites kh (critique fix /^k(?!h)/)', () => {
    expect(phoKey('khong')).toBe('khon')
    expect(phoKey('kem')).toBe('cem')
  })

  it('does not merge l/n (scope cut)', () => {
    expect(phoKey('lam')).not.toBe(phoKey('nam'))
  })
})

describe('preRewrite', () => {
  it('protects decimals from the sentence separator', () => {
    expect(preRewrite('2.5 cộng 1')).toContain('2.5')
    expect(preRewrite('2,5 cộng 1')).toContain('2.5')
    expect(preRewrite('nhảy. vẫy tay')).toContain(SEP_MARK)
  })

  it('drops thousands separators and spaces operators', () => {
    expect(preRewrite('1.000.000').trim()).toBe('1000000')
    expect(preRewrite('2+3').split(/\s+/).filter(Boolean)).toEqual(['2', '+', '3'])
    expect(preRewrite('5x3').split(/\s+/).filter(Boolean)).toEqual(['5', '*', '3'])
  })

  it('expands units next to digits', () => {
    expect(preRewrite('hẹn giờ 5p')).toContain('5 phút')
    expect(preRewrite('đếm ngược 30s')).toContain('30 giây')
  })

  it('marks questions and keeps "TP.HCM" together', () => {
    expect(preRewrite('mấy giờ rồi?')).toContain(Q_MARK)
    expect(preRewrite('thời tiết TP.HCM')).not.toContain(SEP_MARK)
  })
})

describe('tokenize / rewrites', () => {
  it('splits sentences and flags questions', () => {
    const s = tokenize('Nhảy đi! Mấy giờ rồi?')
    expect(s.map((x) => [x.toks.map((t) => t.text).join(' '), x.question])).toEqual([
      ['nhảy đi', false],
      ['mấy giờ rồi', true],
    ])
    expect(s[0]!.toks[0]).toMatchObject({ cap: true, initial: true })
  })

  it('detects no-diacritics input', () => {
    expect(detectMode(tokenize('bat quat len'))).toBe('ascii')
    expect(detectMode(tokenize('bật quạt'))).toBe('accented')
  })

  it('reads "vay" as vậy unless "vay tay" (via tagger priors, not a rewrite)', () => {
    const { subs } = rewriteSentences(tokenize('nhay di vay'), false)
    expect(subs).toEqual([])
  })

  it('applies dialect words without diacritics only where the context rules out the look-alike', () => {
    const subs = (t: string, acc: boolean): string[] =>
      rewriteSentences(tokenize(t), acc).subs.map((s) => `${s.from}>${s.to}`)
    expect(subs('mi làm được chi', true)).toEqual(['mi>mày', 'chi>gì'])
    expect(subs('mi lam duoc chi', false)).toEqual(['mi>mày', 'chi>gì'])
    expect(subs('chu may gio roi rua', false)).toEqual(['chu>bây giờ', 'rua>vậy'])
    // look-alikes stay: chi phí, ăn mì, rửa chén, màu hồng, đau hông
    expect(subs('chi phi bao nhieu', false)).toEqual([])
    expect(subs('an mi tom', false)).toEqual([])
    expect(subs('rua chen', false)).toEqual([])
    expect(subs('den mau hong', false)).toEqual([])
    expect(subs('dau hong qua', false)).toEqual([])
  })

  it('keeps dialect look-alikes in their exception contexts', () => {
    const t = (s: string): string =>
      rewriteSentences(tokenize(s), true)
        .sentences.flatMap((x) => x.toks.map((k) => k.text))
        .join(' ')
    expect(t('chi phí bao nhiêu')).toBe('chi phí bao nhiêu')
    expect(t('mô hình là gì')).toBe('mô hình là gì')
    expect(t('đánh răng')).toBe('đánh răng')
    expect(t('đau hông quá')).toBe('đau hông quá')
    expect(t('bựa ni thứ mấy')).toBe('hôm nay thứ mấy')
  })

  it('treats a capitalized word inside a sentence as a name, not dialect', () => {
    const t = rewriteSentences(tokenize('thời tiết Ho Chi Minh'), true)
    expect(t.subs).toEqual([])
  })

  it('has no dropped critique entries (đặng, bữa mai, nói nhỏ, tắt máy)', () => {
    const { subs } = rewriteSentences(tokenize('đặng bữa mai'), true)
    expect(subs.map((s) => s.from)).not.toContain('đặng')
    expect(subs.map((s) => s.from)).not.toContain('bữa mai')
  })
})
