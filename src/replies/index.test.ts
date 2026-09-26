import { describe, expect, it } from 'vitest'
import { LANGS } from '@/core/lang'
import { DEFAULT_PLACE } from '@/core/places'
import { reply, type ReplyKey, type ReplyParams, type ReplyRef, type ReplyTone } from '@/core/replies'
import type { WeatherData } from '@/core/weather'
import { JOKES, renderReply } from './index'

/** 2026-09-24 08:35 in Vietnam. */
const ISO = '2026-09-24T01:35:00Z'
const HUE = { vi: 'Huế', en: 'Huế' }

function weather(
  over: Partial<WeatherData['current']> = {},
  p: (number | null)[] = [20, 70, null],
): WeatherData {
  return {
    current: {
      tempC: 31.4,
      feelsLikeC: 35.2,
      humidity: 70,
      windKmh: 12.3,
      precipitationMm: 0,
      code: 2,
      isDay: true,
      ...over,
    },
    daily: [
      { date: '2026-09-24', code: 2, maxC: 33, minC: 25, precipProbability: p[0] ?? null },
      { date: '2026-09-25', code: 63, maxC: 30, minC: 24, precipProbability: p[1] ?? null },
      { date: '2026-09-26', code: 0, maxC: 36, minC: 17, precipProbability: p[2] ?? null },
    ],
    fetchedAt: 0,
  }
}

const verb = { vi: 'ăn', en: 'eat' }
const banana = { vi: 'chuối', en: 'a banana' }

/** At least one sample per key — a missing key is a compile error. */
const SAMPLES: { [K in ReplyKey]: ReplyParams[K][] } = {
  'motion.jump': [{ count: 1 }, { count: 3 }],
  'motion.dance': [{ seconds: 8 }],
  'motion.wave': [{ count: 1 }, { count: 2 }],
  'motion.nod': [{ count: 1 }, { count: 4 }],
  'motion.shake_head': [{ count: 1 }, { count: 2 }],
  'motion.thumbs_up': [{ count: 1 }, { count: 2 }],
  'motion.punch': [{ count: 1 }, { count: 3 }],
  'motion.walk': [
    { direction: 'forward', steps: 1 },
    { direction: 'forward', steps: 3 },
    { direction: 'backward', steps: 2 },
    { direction: 'left', steps: 1 },
    { direction: 'right', steps: 4 },
    { direction: 'to_user', steps: 3 },
    { direction: 'home', steps: 3 },
  ],
  'motion.walk_blocked': [{}],
  'motion.run': [{ seconds: 5 }],
  'motion.turn': [
    { direction: 'left', count: 1 },
    { direction: 'right', count: 1 },
    { direction: 'around', count: 1 },
    { direction: 'spin', count: 1 },
    { direction: 'spin', count: 3 },
  ],
  'motion.sit': [{}],
  'motion.already_sitting': [{}],
  'motion.stand': [{}],
  'motion.already_standing': [{}],
  'motion.sleep': [{}],
  'motion.already_sleeping': [{}],
  'motion.wake': [{}],
  'motion.already_awake': [{}],
  'motion.fall': [{}],
  'motion.fall_recover': [{}],
  'motion.emote': [{ emotion: 'happy' }, { emotion: 'sad' }, { emotion: 'angry' }, { emotion: 'surprised' }],
  'motion.stop': [{}],
  'motion.custom_move': [
    { name: { vi: 'Lộn nhào', en: 'Somersault' }, count: 1 },
    { name: { vi: 'Moonwalk', en: 'Moonwalk' }, count: 2 },
    { name: null, count: 1 },
    { name: { vi: 'x<script>', en: 'x<script>' }, count: 1 },
  ],
  'ai.thinking': [{}],
  'ai.move_failed': [{}],
  'motion.chain': [
    {
      actions: [
        { type: 'jump', count: 3 },
        { type: 'wave', count: 1 },
      ],
    },
    {
      actions: [
        { type: 'walk', direction: 'left', steps: 2 },
        { type: 'turn', direction: 'spin', count: 2 },
        { type: 'emote', emotion: 'happy' },
        { type: 'sit' },
        { type: 'punch', count: 2 },
        { type: 'fall' },
      ],
    },
  ],
  'info.time': [{ iso: ISO }],
  'info.date': [-1, 0, 1, 2].map((d) => ({ iso: ISO, dayOffset: d as -1 | 0 | 1 | 2 })),
  'info.weekday': [-1, 0, 1, 2].map((d) => ({ iso: ISO, dayOffset: d as -1 | 0 | 1 | 2 })),
  'info.lunar': [
    ...(['date', 'year', 'tet', 'ram', 'mung1'] as const).flatMap((query) =>
      [-1, 0, 1, 2].map((d) => ({ iso: ISO, query, dayOffset: d as -1 | 0 | 1 | 2 })),
    ),
    { iso: ISO, query: 'year', dayOffset: 0, yearOffset: 1 },
    { iso: ISO, query: 'year', dayOffset: 0, yearOffset: -1 },
    { iso: ISO, query: 'ram', dayOffset: 0, month: 1 },
    { iso: ISO, query: 'ram', dayOffset: 0, month: 8 },
    { iso: ISO, query: 'mung1', dayOffset: 0, month: 12 },
  ],
  'info.weather': (['general', 'rain', 'temp'] as const).flatMap((aspect) =>
    ([0, 1, 2] as const).map((dayOffset) => ({ place: HUE, dayOffset, aspect, data: weather() })),
  ),
  'info.weather_error': [
    { place: HUE, reason: 'offline' },
    { place: HUE, reason: 'timeout' },
    { place: HUE, reason: 'http' },
  ],
  'info.math': [
    { expr: [2, '+', 3, '*', 4], result: 14 },
    { expr: [7, '-', 10], result: -3 },
    { expr: [10, '/', 3], result: 10 / 3 },
  ],
  'info.math_error': [
    { expr: [1, '/', 0], error: 'div0' },
    { expr: [1e300, '*', 1e300], error: 'overflow' },
  ],
  'timer.start': [{ seconds: 60 }, { seconds: 90, label: 'nấu cơm' }, { seconds: 3600 + 125 }],
  'timer.done': [{}, { label: 'nấu cơm' }],
  'timer.cancel': [{}, { label: 'uống thuốc' }],
  'timer.none': [{}, { label: 'uống thuốc' }],
  'timer.dismissed': [{}, { label: 'uống thuốc' }],
  'timer.status': [{ remainingSec: 42.3 }, { remainingSec: 125, label: 'uống thuốc' }, { remainingSec: 0 }],
  'timer.limit': [{ max: 3 }],
  'timer.ask': [{}, { label: 'uống thuốc' }, { label: 'thức dậy' }],
  'timer.clock_time': [{}, { label: 'uống thuốc' }],
  'info.weather_unknown_place': [{ place: DEFAULT_PLACE.name }],
  'chat.emergency': [{}],
  'home.later': [
    { device: 'light', power: 'off' },
    { device: 'fan', power: 'on' },
  ],
  'chat.greet': [{ iso: ISO }, { iso: '2026-09-24T12:00:00Z' }, { iso: '2026-09-24T17:00:00Z' }],
  'chat.thanks': [{}],
  'chat.goodbye': [{}],
  'chat.praise': [{}],
  'chat.insult': [{}],
  'chat.intro': [
    { topic: 'who' },
    { topic: 'creator' },
    { topic: 'age' },
    { topic: 'project', wer: 0.07845 },
    { topic: 'project' },
  ],
  'chat.capabilities': [{}],
  'chat.joke': [{ index: 0 }, { index: 7 }, { index: 99 }, { index: -1 }],
  'chat.smalltalk': [
    { topic: 'how_are_you' },
    { topic: 'love' },
    { topic: 'user_sad' },
    { topic: 'user_tired' },
    { topic: 'user_happy' },
  ],
  'pref.voice': [{ on: true }, { on: false }],
  'pref.language': [{ lang: 'vi' }, { lang: 'en' }],
  'home.light_on': [{}, { color: 'blue' }],
  'home.light_off': [{}],
  'home.light_color': [{ color: 'red' }, { color: 'warm' }],
  'home.light_already': [{ on: true }, { on: false }],
  'home.xanh_ambiguous': [{}],
  'home.black_is_off': [{}],
  'home.fan_on': [{ speed: 3 }],
  'home.fan_off': [{}],
  'home.fan_speed': [{ speed: 3, delta: 1 }, { speed: 1, delta: -1 }, { speed: 2 }],
  'home.fan_already': [{ on: true }, { on: false }],
  'home.fan_speed_limit': [{ speed: 3 }, { speed: 1 }],
  unsupported: [
    { reason: 'physical', verb, object: banana, alternative: 'jump' },
    { reason: 'physical', verb },
    { reason: 'device_absent', verb: { vi: 'bật', en: 'turn on' }, object: { vi: 'ti vi', en: 'a TV' } },
    { reason: 'device_absent', verb: { vi: 'bật', en: 'turn on' } },
    { reason: 'out_of_scope', verb: { vi: 'gọi điện', en: 'make phone calls' }, alternative: 'wave' },
    { reason: 'unsafe', verb: { vi: 'nhảy lầu', en: 'jump off a building' } },
  ],
  negation: [
    { target: 'jump' },
    { target: 'light' },
    { target: 'weather' },
    ...(['happy', 'sad', 'angry', 'surprised'] as const).map((emotion) => ({
      target: 'emote' as const,
      emotion,
    })),
  ],
  unknown: [{ suggestions: [] }, { suggestions: ['nhảy lên', 'mấy giờ rồi?', 'bật đèn'] }],
  partial_unknown: [{}],
  'note.capped': [
    { max: 10 },
    { max: 10, caps: [{ action: 'jump', unit: 'times', max: 10 }] },
    {
      max: 5,
      caps: [
        { action: 'turn', unit: 'spins', max: 5 },
        { action: 'walk', unit: 'steps', max: 10 },
        { action: 'dance', unit: 'seconds', max: 60 },
      ],
    },
  ],
  'note.nothing_to_repeat': [{}],
  'note.too_many_actions': [{ max: 6 }],
  welcome: [{ layout: 'side' }, { layout: 'stacked' }],
  'robot.not_ready': [{}],
  'asr.empty': [{}],
  'asr.error': (
    [
      'network',
      'timeout',
      'too_large',
      'unsupported_media',
      'unprocessable',
      'busy',
      'http',
      'bad_response',
    ] as const
  ).map((kind) => ({ kind })),
  'error.generic': [{}],
}

const allRefs: ReplyRef[] = (Object.keys(SAMPLES) as ReplyKey[]).flatMap((key) =>
  (SAMPLES[key] as ReplyParams[typeof key][]).flatMap((params) => [
    reply(key, params as never),
    reply(key, params as never, 1),
  ]),
)

const render = (key: ReplyKey, params: object, lang: 'vi' | 'en' = 'vi', seed?: number) =>
  renderReply(reply(key, params as never, seed), lang)

describe('renderReply — every key', () => {
  const generic = {
    vi: renderReply(reply('error.generic', {}), 'vi').text,
    en: renderReply(reply('error.generic', {}), 'en').text,
  }

  /** Every problem found for one rendered reply (empty = clean). */
  function problems(ref: ReplyRef, lang: 'vi' | 'en'): string[] {
    const r = renderReply(ref, lang)
    const out: string[] = []
    if (!r.text.trim()) out.push('empty text')
    if (!r.speech.trim()) out.push('empty speech')
    for (const s of [r.text, r.speech]) {
      if (/[{}]|undefined|NaN|null|\[object/.test(s)) out.push(`placeholder leak: ${s}`)
      if (/\p{Extended_Pictographic}/u.test(s)) out.push(`emoji: ${s}`)
    }
    // A template that throws would silently fall back to the generic error.
    if (ref.key !== 'error.generic' && r.text === generic[lang]) out.push('fell back to error.generic')
    if (lang === 'vi' && r.text.includes('°')) out.push(`° in VI text: ${r.text}`)
    if (lang === 'vi' && /(^|\s)Dạ[\s,.…]|\sạ[.!?]/.test(r.text)) out.push(`formal register: ${r.text}`)
    // Speech never carries symbols or names a TTS voice mangles.
    if (/[%°×÷/]|\bWER\b|PhoWhisper|ViMD/.test(r.speech)) out.push(`unspoken symbol: ${r.speech}`)
    return out.map((p) => `${lang} ${ref.key} ${JSON.stringify(ref.params)}: ${p}`)
  }

  it.each(LANGS)('renders all keys cleanly in %s', (lang) => {
    expect(allRefs.flatMap((ref) => problems(ref, lang))).toEqual([])
  })
})

describe('info.time', () => {
  it('formats Vietnam time', () => {
    expect(render('info.time', { iso: ISO }).text).toBe('Bây giờ là 8 giờ 35 phút sáng.')
    expect(render('info.time', { iso: ISO }, 'en').text).toBe("It's 8:35 AM.")
  })
  it.each([
    ['2026-09-24T05:00:00Z', 'Bây giờ là đúng 12 giờ trưa.', "It's 12:00 PM."],
    ['2026-09-24T06:05:00Z', 'Bây giờ là 1 giờ 5 phút chiều.', "It's 1:05 PM."],
    ['2026-09-23T17:10:00Z', 'Bây giờ là 12 giờ 10 phút đêm.', "It's 12:10 AM."],
    ['2026-09-24T02:30:00Z', 'Bây giờ là 9 giờ rưỡi sáng.', "It's 9:30 AM."],
    ['2026-09-24T12:45:00Z', 'Bây giờ là 7 giờ 45 phút tối.', "It's 7:45 PM."],
  ])('%s', (iso, v, e) => {
    expect(render('info.time', { iso }).text).toBe(v)
    expect(render('info.time', { iso }, 'en').text).toBe(e)
  })
})

describe('date and weekday', () => {
  it('uses day prefixes and weekday names', () => {
    expect(render('info.date', { iso: ISO, dayOffset: 0 }).text).toBe(
      'Hôm nay là thứ Năm, ngày 24 tháng 9 năm 2026.',
    )
    expect(render('info.date', { iso: ISO, dayOffset: 0 }, 'en').text).toBe(
      'Today is Thursday, September 24, 2026.',
    )
    expect(render('info.date', { iso: ISO, dayOffset: -1 }, 'en').text).toBe(
      'Yesterday was Wednesday, September 23, 2026.',
    )
    expect(render('info.weekday', { iso: ISO, dayOffset: 1 }).text).toBe('Ngày mai là thứ Sáu.')
    expect(render('info.weekday', { iso: ISO, dayOffset: 2 }).text).toBe('Ngày kia là thứ Bảy.')
    expect(render('info.weekday', { iso: ISO, dayOffset: -1 }).text).toBe('Hôm qua là thứ Tư.')
    expect(render('info.weekday', { iso: '2026-09-26T20:00:00Z', dayOffset: 0 }).text).toBe(
      'Hôm nay là Chủ nhật.',
    )
  })
})

describe('info.lunar', () => {
  const lunar = (query: ReplyParams['info.lunar']['query'], iso = ISO, dayOffset: -1 | 0 | 1 | 2 = 0) => ({
    vi: render('info.lunar', { iso, query, dayOffset }).text,
    en: render('info.lunar', { iso, query, dayOffset }, 'en').text,
  })

  it('date with a festival note for tomorrow', () => {
    const r = lunar('date')
    expect(r.vi).toBe('Hôm nay là ngày 14 tháng 8 âm lịch, năm Bính Ngọ. Ngày mai là Tết Trung Thu đó!')
    expect(r.en).toBe(
      'Today is day 14 of the 8th lunar month, in the year of Bính Ngọ (the Horse). Tomorrow is the Mid-Autumn Festival!',
    )
  })
  it('date on the festival itself, rằm and mùng', () => {
    expect(lunar('date', ISO, 1).vi).toBe(
      'Ngày mai là ngày rằm tháng 8 âm lịch, năm Bính Ngọ. Đúng ngày Tết Trung Thu luôn đó!',
    )
    expect(lunar('date', '2026-10-14T03:00:00Z').vi).toMatch(/^Hôm nay là mùng 5 tháng 9 âm lịch/)
    // 25/7/2025 is the 1st day of the leap 6th month.
    expect(lunar('date', '2025-07-25T03:00:00Z').vi).toBe(
      'Hôm nay là mùng 1 tháng 6 nhuận âm lịch, năm Ất Tỵ.',
    )
    expect(lunar('date', '2025-07-25T03:00:00Z').en).toMatch(/day 1 of the leap 6th lunar month/)
    // 21/1/2023 = 30 tháng Chạp; Tết is tomorrow.
    expect(lunar('date', '2023-01-21T03:00:00Z').vi).toBe(
      'Hôm nay là ngày 30 tháng Chạp âm lịch, năm Nhâm Dần. Ngày mai là Tết Nguyên Đán đó!',
    )
  })
  it('year', () => {
    expect(lunar('year').vi).toBe('Năm nay là năm Bính Ngọ, năm con Ngựa.')
    expect(lunar('year').en).toBe('This lunar year is Bính Ngọ, the year of the Horse.')
    expect(lunar('year', '2027-01-15T03:00:00Z').vi).toBe(
      'Theo âm lịch, bây giờ vẫn là năm Bính Ngọ, năm con Ngựa.',
    )
    expect(lunar('year', '2023-05-01T03:00:00Z').vi).toBe('Năm nay là năm Quý Mão, năm con Mèo.')
  })
  it('tết countdown and greeting', () => {
    const r = lunar('tet')
    expect(r.vi).toBe('Còn 135 ngày nữa là đến Tết Đinh Mùi, rơi vào thứ Bảy, ngày 6 tháng 2 năm 2027.')
    expect(r.en).toBe(
      'There are 135 days until Tết, the Lunar New Year of Đinh Mùi (the Goat). It falls on Saturday, February 6, 2027.',
    )
    // 17/2/2026 = mùng 1 Tết Bính Ngọ.
    expect(lunar('tet', '2026-02-17T03:00:00Z').vi).toBe('Hôm nay là mùng 1 Tết! Chúc mừng năm mới!')
    expect(lunar('tet', '2026-02-19T03:00:00Z').en).toBe('Today is day 3 of Tết. Happy Lunar New Year!')
    expect(lunar('tet', '2026-02-16T03:00:00Z').vi).toBe(
      'Ngày mai là Tết Bính Ngọ rồi, thứ Ba, ngày 17 tháng 2 năm 2026!',
    )
  })
  it('rằm and mùng 1', () => {
    expect(lunar('ram').vi).toBe(
      'Rằm tháng 8 âm lịch rơi vào thứ Sáu, ngày 25 tháng 9 năm 2026, là ngày mai đó. Đó cũng là Tết Trung Thu.',
    )
    expect(lunar('ram').en).toBe(
      "The full moon day (15th) of the 8th lunar month falls on Friday, September 25, 2026, that's tomorrow. That's also the Mid-Autumn Festival.",
    )
    expect(lunar('mung1').vi).toBe(
      'Mùng 1 tháng 9 âm lịch rơi vào thứ Bảy, ngày 10 tháng 10 năm 2026, còn 16 ngày nữa.',
    )
    expect(lunar('mung1').en).toBe(
      'The 1st day of the 9th lunar month falls on Saturday, October 10, 2026, in 16 days.',
    )
    // After rằm, the next month's rằm (15/9/2026 = 24/10/2026).
    expect(lunar('ram', '2026-09-26T03:00:00Z').vi).toMatch(
      /^Rằm tháng 9 âm lịch rơi vào thứ Bảy, ngày 24 tháng 10 năm 2026/,
    )
    expect(lunar('ram', '2026-09-25T03:00:00Z').vi).toBe(
      'Hôm nay là rằm tháng 8 âm lịch đó! Đó cũng là Tết Trung Thu.',
    )
    expect(lunar('mung1', '2026-10-10T03:00:00Z').vi).toBe('Hôm nay là mùng 1 tháng 9 âm lịch đó!')
  })
})

describe('info.weather', () => {
  const w = (aspect: 'general' | 'rain' | 'temp', dayOffset: 0 | 1 | 2, data = weather()) => ({
    vi: renderReply(reply('info.weather', { place: HUE, dayOffset, aspect, data }), 'vi'),
    en: renderReply(reply('info.weather', { place: HUE, dayOffset, aspect, data }), 'en'),
  })
  it('general today uses current conditions', () => {
    const r = w('general', 0)
    expect(r.vi.text).toBe('Bây giờ ở Huế có mây rải rác, 31 độ C, độ ẩm 70%, gió 12 km/h.')
    expect(r.vi.speech).toBe(
      'Bây giờ ở Huế có mây rải rác, 31 độ C, độ ẩm 70 phần trăm, gió 12 ki lô mét trên giờ.',
    )
    expect(r.en.text).toBe('Right now in Huế: partly cloudy, 31°C, humidity 70%, wind 12 km/h.')
    expect(r.en.speech).toBe(
      'Right now in Huế: partly cloudy, 31 degrees Celsius, humidity 70 percent, wind 12 kilometers per hour.',
    )
  })
  it('forecast days use daily data with advice', () => {
    expect(w('general', 1).vi.text).toBe(
      'Ngày mai ở Huế có mưa vừa, nhiệt độ từ 24 đến 30 độ C, khả năng mưa 70%. Bạn nhớ mang ô nhé!',
    )
    expect(w('general', 2).vi.text).toBe(
      'Ngày kia ở Huế trời quang đãng, nhiệt độ từ 17 đến 36 độ C. Trời nóng lắm, nhớ uống đủ nước nhé!',
    )
    expect(w('general', 1).en.text).toBe(
      "Tomorrow in Huế: moderate rain, 24 to 30°C, 70% chance of rain. Don't forget your umbrella!",
    )
  })
  it('rain levels', () => {
    expect(w('rain', 1).vi.text).toBe('Ngày mai ở Huế nhiều khả năng có mưa (70%). Bạn nhớ mang ô nhé!')
    expect(w('rain', 0).vi.text).toBe('Hôm nay ở Huế ít khả năng mưa (20%).')
    expect(w('rain', 0, weather({}, [45, null, null])).en.text).toBe(
      'Today in Huế, rain is possible (45%). Better bring an umbrella.',
    )
    expect(w('rain', 0, weather({ code: 61 })).vi.text).toBe('Bây giờ ở Huế có mưa nhỏ. Bạn nhớ mang ô nhé!')
  })
  it('temperature with hot / cold advice', () => {
    expect(w('temp', 0).vi.text).toBe('Ở Huế đang 31 độ C, cảm giác như 35 độ.')
    expect(w('temp', 0, weather({ tempC: 36, feelsLikeC: 40 })).vi.text).toMatch(/nhớ uống đủ nước nhé!$/)
    expect(w('temp', 0, weather({ tempC: 16, feelsLikeC: 14 })).en.text).toBe(
      "In Huế it's 16°C right now, and it feels like 14°C. It's chilly, so dress warmly!",
    )
    expect(w('temp', 1).vi.text).toBe('Ngày mai ở Huế nhiệt độ từ 24 đến 30 độ C.')
  })
  it('default place is spelled out for TTS', () => {
    const r = renderReply(
      reply('info.weather', { place: DEFAULT_PLACE.name, dayOffset: 0, aspect: 'general', data: weather() }),
      'vi',
    )
    expect(r.text).toMatch(/^Bây giờ ở TP\. Hồ Chí Minh/)
    expect(r.speech).toMatch(/^Bây giờ ở thành phố Hồ Chí Minh/)
  })
  it('errors per reason', () => {
    expect(render('info.weather_error', { place: HUE, reason: 'offline' }).text).toBe(
      'Xin lỗi, mình chưa xem được thời tiết ở Huế vì máy đang mất kết nối mạng. Bạn thử lại sau nhé.',
    )
    expect(render('info.weather_error', { place: HUE, reason: 'timeout' }, 'en').tone).toBe('sorry')
  })
})

describe('info.math', () => {
  it('reads the expression with operator words', () => {
    expect(render('info.math', { expr: [2, '+', 3, '*', 4], result: 14 }).text).toBe(
      '2 cộng 3 nhân 4 bằng 14.',
    )
    expect(render('info.math', { expr: [2, '+', 3, '*', 4], result: 14 }, 'en').text).toBe(
      '2 plus 3 times 4 equals 14.',
    )
    expect(render('info.math', { expr: [7, '-', 10], result: -3 }).text).toBe('7 trừ 10 bằng âm 3.')
    expect(render('info.math', { expr: [7, '-', 10], result: -3 }, 'en').text).toBe(
      '7 minus 10 equals negative 3.',
    )
    expect(render('info.math', { expr: [10, '/', 3], result: 10 / 3 }).text).toBe(
      '10 chia 3 bằng khoảng 3,3333.',
    )
    expect(render('info.math', { expr: [1.5, '*', 1000], result: 1500 }).text).toBe(
      '1,5 nhân 1.000 bằng 1.500.',
    )
    expect(render('info.math', { expr: [0.1, '+', 0.2], result: 0.1 + 0.2 }, 'en').text).toBe(
      '0.1 plus 0.2 equals 0.3.',
    )
  })
  it('errors', () => {
    const div0 = render('info.math_error', { expr: [1, '/', 0], error: 'div0' })
    expect(div0.text).toBe('Ôi, không chia cho 0 được đâu bạn!')
    expect(div0.tone).toBe('sorry')
    expect(render('info.math_error', { expr: [1, '/', 0], error: 'div0' }, 'en').text).toBe(
      "Oops, you can't divide by zero!",
    )
  })
})

describe('timers', () => {
  it('natural durations and labels', () => {
    expect(render('timer.start', { seconds: 90 }).text).toBe(
      'Mình đã hẹn giờ 1 phút 30 giây. Hết giờ mình sẽ báo bạn nhé!',
    )
    expect(render('timer.start', { seconds: 3725 }, 'en').text).toBe(
      "Timer set for 1 hour 2 minutes 5 seconds. I'll let you know when time's up!",
    )
    expect(render('timer.start', { seconds: 60, label: 'nấu cơm' }).text).toBe(
      'Được rồi, 1 phút nữa mình sẽ nhắc bạn “nấu cơm” nhé!',
    )
    expect(render('timer.status', { remainingSec: 41.2 }).text).toBe('Còn 42 giây nữa là hết giờ.')
    expect(render('timer.status', { remainingSec: 61 }, 'en').text).toBe('1 minute 1 second left.')
    const done = render('timer.done', { label: 'nấu cơm' })
    expect(done.text).toBe('Reng reng! Đến giờ “nấu cơm” rồi đó!')
    expect(done.speech).toBe('Reng reng! Đến giờ nấu cơm rồi đó!')
    expect(done.tone).toBe('alert')
  })
  it('drops labels that do not look like a lexicon phrase', () => {
    expect(render('timer.done', { label: '<b>hi</b>' }).text).toBe('Reng reng! Hết giờ rồi bạn ơi!')
  })
})

describe('motion', () => {
  it('chains into one acknowledgement', () => {
    const actions: ReplyParams['motion.chain']['actions'] = [
      { type: 'jump', count: 3 },
      { type: 'wave', count: 1 },
    ]
    expect(render('motion.chain', { actions }).text).toBe('Được! Nhảy 3 lần rồi vẫy tay nè.')
    expect(render('motion.chain', { actions }, 'en').text).toBe('Okay! Jumping 3 times, then waving.')
    const three: ReplyParams['motion.chain']['actions'] = [
      ...actions,
      { type: 'turn', direction: 'spin', count: 1 },
    ]
    expect(render('motion.chain', { actions: three }).text).toBe(
      'Được! Nhảy 3 lần, vẫy tay rồi xoay một vòng nè.',
    )
    expect(render('motion.chain', { actions: three }, 'en').text).toBe(
      'Okay! Jumping 3 times, waving, then spinning around.',
    )
  })
  it('names an AI-invented move, in a chain too; an unsafe name becomes a generic line', () => {
    const roll = { vi: 'Lộn nhào', en: 'Somersault' }
    expect(render('motion.custom_move', { name: roll, count: 1 }).text).toBe('Xem mình Lộn nhào nè!')
    expect(render('motion.custom_move', { name: roll, count: 2 }, 'en').text).toBe(
      'Watch this: Somersault, 2 times!',
    )
    const bad = { vi: 'x<b>', en: 'x<b>' }
    expect(render('motion.custom_move', { name: bad, count: 1 }).text).toBe('Xem mình làm nè!')
    const move = { name: roll } as ReplyParams['motion.chain']['actions'][number] extends infer A
      ? A extends { type: 'custom_move'; move: infer M }
        ? M
        : never
      : never
    const actions: ReplyParams['motion.chain']['actions'] = [
      { type: 'jump', count: 3 },
      { type: 'custom_move', move, count: 1 },
    ]
    expect(render('motion.chain', { actions }).text).toBe('Được! Nhảy 3 lần rồi lộn nhào nè.')
    expect(render('motion.chain', { actions }, 'en').text).toBe(
      'Okay! Jumping 3 times, then doing the somersault.',
    )
  })
  it('counts', () => {
    expect(render('motion.jump', { count: 3 }).text).toBe('Mình nhảy 3 lần nhé!')
    expect(render('motion.jump', { count: 1 }).text).toBe('Hây da! Nhảy nè!')
    expect(render('motion.walk', { direction: 'left', steps: 3 }, 'en').text).toBe(
      'Walking 3 steps to the left.',
    )
  })
})

describe('meta', () => {
  it('unsupported banana with an alternative', () => {
    const p = { reason: 'physical', verb, object: banana, alternative: 'jump' } as const
    const v = render('unsupported', p)
    expect(v.text).toBe('Xin lỗi, mình là robot nên không thể ăn chuối được. Nhưng mình có thể nhảy nè!')
    expect(v.tone).toBe('sorry')
    expect(render('unsupported', p, 'en').text).toBe(
      "Sorry, I'm a robot, so I can't eat a banana. But I can jump!",
    )
  })
  it('unknown shows only safe suggestions and never the user text', () => {
    const r = render('unknown', { suggestions: ['nhảy lên', 'mấy giờ rồi?'] })
    expect(r.text).toBe('Xin lỗi, mình chưa hiểu ý bạn. Bạn thử nói “nhảy lên” hoặc “mấy giờ rồi?” nhé.')
    expect(r.tone).toBe('question')
    const en = render('unknown', { suggestions: ['nhảy lên', 'mấy giờ rồi?'] }, 'en')
    expect(en.text).toBe("Sorry, I didn't understand that. Try saying “nhảy lên” or “mấy giờ rồi?”.")
    expect(en.speech).toBe("Sorry, I didn't understand that. Try one of the suggested commands.")

    const hostile = ['<img src=x onerror=alert(1)>', 'https://evil.example/x', 'a'.repeat(80), 'x{y}']
    const base = render('unknown', { suggestions: [] }).text
    const h = render('unknown', { suggestions: hostile })
    expect(h.text).toBe(base)
    for (const s of hostile) {
      expect(h.text).not.toContain(s)
      expect(h.speech).not.toContain(s)
    }
    // The params carry no user text at all: the same suggestions always render the same reply.
    expect(render('unknown', { suggestions: ['bật đèn'] }).text).toBe(
      'Xin lỗi, mình chưa hiểu ý bạn. Bạn thử nói “bật đèn” nhé.',
    )
  })
  it('negation', () => {
    expect(render('negation', { target: 'jump' }).text).toBe('Được rồi, mình sẽ không nhảy đâu.')
    expect(render('negation', { target: 'jump' }, 'en').text).toBe("Okay, I won't jump.")
  })
  it('welcome adapts to the layout', () => {
    expect(render('welcome', { layout: 'side' }).text).toContain('gõ lệnh ở ô bên phải')
    expect(render('welcome', { layout: 'stacked' }).text).toContain('gõ lệnh ở ô bên dưới')
    expect(render('welcome', { layout: 'side' }).text).toContain('Ronaldo')
  })
  it('home colour names', () => {
    expect(render('home.light_color', { color: 'blue' }).text).toBe(
      'Đèn đã chuyển sang màu xanh dương rồi nè.',
    )
    expect(render('home.light_on', { color: 'warm' }, 'en').text).toBe('The light is on, in warm white!')
  })
})

describe('chat', () => {
  it('intro project is hedged and speaks names clearly', () => {
    const v = render('chat.intro', { topic: 'project', wer: 0.07845 })
    expect(v.text).toContain('Sắp tới')
    expect(v.text).toContain('PhoWhisper-large')
    expect(v.text).toContain('ViMD')
    expect(v.text).toContain('7,8%')
    expect(v.speech).toContain('Pho Whisper large')
    expect(v.speech).toContain('Vi M D')
    expect(v.speech).toContain('tỉ lệ lỗi từ khoảng 7,8 phần trăm')
    const e = render('chat.intro', { topic: 'project', wer: 0.07845 }, 'en')
    expect(e.text).toContain('7.8%')
    expect(e.speech).toContain('word error rate of about 7.8 percent')
    expect(render('chat.intro', { topic: 'project' }).text).not.toMatch(/WER|%/)
  })
  it('intro names the bot, team and mentor', () => {
    expect(render('chat.intro', { topic: 'who' }).text).toMatch(/^Mình là Ronaldo/)
    expect(render('chat.intro', { topic: 'creator' }).text).toContain('Thầy Phạm Đức Đạt')
  })
  it('greets by part of day', () => {
    expect(render('chat.greet', { iso: ISO }).text).toMatch(/^Chào buổi sáng!/)
    expect(render('chat.greet', { iso: '2026-09-24T12:00:00Z' }, 'en').text).toMatch(/^Good evening!/)
  })
  it('has 13+ jokes and wraps the index', () => {
    expect(JOKES.length).toBeGreaterThanOrEqual(13)
    expect(render('chat.joke', { index: JOKES.length }).text).toBe(JOKES[0]!.vi)
    expect(render('chat.joke', { index: -1 }, 'en').text).toBe(JOKES[JOKES.length - 1]!.en)
  })
})

describe('tone and variants', () => {
  const tones: [ReplyKey, object, ReplyTone][] = [
    ['unsupported', { reason: 'unsafe', verb }, 'sorry'],
    ['chat.insult', {}, 'sorry'],
    ['info.weather_error', { place: HUE, reason: 'http' }, 'sorry'],
    ['info.math_error', { expr: [], error: 'overflow' }, 'sorry'],
    ['asr.error', { kind: 'busy' }, 'sorry'],
    ['error.generic', {}, 'sorry'],
    ['robot.not_ready', {}, 'sorry'],
    ['timer.limit', { max: 3 }, 'sorry'],
    ['timer.done', {}, 'alert'],
    ['unknown', { suggestions: [] }, 'question'],
    ['home.xanh_ambiguous', {}, 'question'],
    ['motion.jump', { count: 1 }, 'normal'],
    ['info.time', { iso: ISO }, 'normal'],
    ['asr.empty', {}, 'normal'],
  ]
  it.each(tones)('%s → %s', (key, params, tone) => {
    expect(render(key, params).tone).toBe(tone)
    expect(render(key, params, 'en').tone).toBe(tone)
  })
  it('variants are deterministic by seed, default first', () => {
    expect(render('motion.jump', { count: 1 }, 'vi', undefined).text).toBe('Hây da! Nhảy nè!')
    expect(render('motion.jump', { count: 1 }, 'vi', 0).text).toBe('Hây da! Nhảy nè!')
    expect(render('motion.jump', { count: 1 }, 'vi', 1).text).toBe('Hấp! Mình nhảy lên nè!')
    expect(render('motion.jump', { count: 1 }, 'vi', 7).text).toBe(
      render('motion.jump', { count: 1 }, 'vi', 7).text,
    )
  })
  it('never throws on malformed params', () => {
    const bad = {
      key: 'info.weather',
      params: { place: HUE, dayOffset: 0, aspect: 'general' },
    } as unknown as ReplyRef
    const r = renderReply(bad, 'vi')
    expect(r.text).toBe('Xin lỗi, có lỗi gì đó rồi. Bạn thử lại nhé.')
    expect(r.tone).toBe('sorry')
  })
})
