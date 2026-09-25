import { LIMITS, type Action, type ActionOf, type DayOffset, type Emotion } from '@/core/actions'
import type { Note, ParseContext, Suggestion } from '@/core/parser'
import type { FanSpeed } from '@/core/room'
import { SLOT_SUGGESTIONS } from './lexicon/exemplars'
import { SUBJECT_BRIDGES, USER_PRONOUNS } from './lexicon/fillers'
import { DEVICE_VERBS, OPENABLE, type UnsupportedEntry } from './lexicon/unsupported'
import { findObject, findTimerLabelAt, toPlaceRef, type MathHit } from './slots'
import type { Concept, Match, Span } from './tagger'
import { canonSyl, strip } from './text'
import type { Tok } from './types'

/**
 * Intent resolution for one clause (spec §4.2–§4.4, §6): extractors run in priority order and
 * consume the spans they use; modifiers (counts, directions, steps, durations) attach to the
 * nearest action; negation and carry-over are applied last.
 */

export interface ClauseInput {
  index: number
  toks: Tok[]
  spans: Span[]
  math: MathHit | null
  question: boolean
  /** A trailing "nữa" was stripped ("đừng nhảy nữa"). */
  hadNua: boolean
}

export interface Draft {
  action: Action
  /** Token position used for ordering inside the clause. */
  pos: number
  spans: Span[]
  source: 'rule' | 'carry' | 'implicit' | 'repeat'
  confMul: number
  negated?: boolean
  /** Motion/turn direction came from its own phrase (not a default). */
  fixedDir?: boolean
  /** math tokens are covered without spans */
  mathRange?: [number, number]
}

export interface Carry {
  device?: 'light' | 'fan'
  verb?: 'on' | 'off'
  motion?: 'turn' | 'walk'
  /** The previous clause set a reminder ("nhắc tôi … sau 5 phút và tắt bếp sau 10 phút"). */
  timer?: boolean
}

export interface ClauseOutcome {
  drafts: Draft[]
  notes: Note[]
  suggestions: Suggestion[]
  /** A rule fired but a slot is missing ("bật lên"): unknown + slot chips. */
  missing: boolean
  consumed: Set<Span>
}

/** Concepts that can start an action (used for coverage, soft-separator and object limits). */
export const HEADS: ReadonlySet<Concept> = new Set<Concept>([
  'JUMP',
  'DANCE',
  'WAVE',
  'NOD',
  'SHAKE',
  'THUMB',
  'PUNCH',
  'WALK',
  'WALK_USER',
  'WALK_HOME',
  'BACK',
  'RUN',
  'TURN',
  'AROUND',
  'SPIN',
  'SIT',
  'STAND',
  'SLEEP',
  'WAKE',
  'FALL',
  'STOP',
  'SAD',
  'ANGRY',
  'SURPRISE',
  'HAPPY',
  'TIRED',
  'TIME',
  'DATE',
  'WEEKDAY',
  'LUNAR',
  'LUNAR_YEAR',
  'TET',
  'RAM',
  'FESTIVAL',
  'MUNG1',
  'TIMER',
  'REMIND',
  'WAKE_ME',
  'EMERGENCY',
  'STATUS',
  'WEATHER',
  'RAIN',
  'SUNNY',
  'GREET',
  'THANKS',
  'BYE',
  'PRAISE',
  'INSULT',
  'WHO',
  'CREATOR',
  'AGE',
  'PROJECT',
  'HOWRU',
  'CAPS',
  'JOKE',
  'LOVE',
  'MUTE',
  'UNMUTE',
  'LANG_EN',
  'LANG_VI',
  'ON',
  'OFF',
  'CLOSE',
  'LIGHT',
  'FAN',
  'IMPL_DARK',
  'IMPL_HOT',
  'IMPL_COLD',
  'UNSUP',
  'UNSAFE',
  'DEVICE',
  'REPEAT',
])

/** "năm sau / năm tới / sang năm" = +1, "năm ngoái / năm trước / năm rồi" = −1. */
function yearOffsetOf(toks: readonly Tok[]): number {
  for (let k = 0; k + 1 < toks.length; k++) {
    const a = toks[k]
    const b = toks[k + 1]
    if (tokIs(a, 'năm') && tokIs(b, 'sau', 'tới', 'tới đây')) return 1
    if (tokIs(a, 'sang') && tokIs(b, 'năm')) return 1
    if (tokIs(a, 'năm') && tokIs(b, 'ngoái', 'trước', 'rồi', 'qua')) return -1
  }
  return 0
}

const MONTH_WORDS: Record<string, number> = { giêng: 1, chạp: 12 }

/** The lunar month a question names: Trung Thu = 8, Vu Lan = 7, "rằm / mùng 1 tháng Giêng" … */
function festivalMonth(toks: readonly Tok[]): number | undefined {
  for (let k = 0; k < toks.length; k++) {
    if (tokIs(toks[k], 'trung') && tokIs(toks[k + 1], 'thu')) return 8
    if (tokIs(toks[k], 'vu') && tokIs(toks[k + 1], 'lan')) return 7
    if (tokIs(toks[k], 'nguyên') && tokIs(toks[k + 1], 'tiêu')) return 1
    if (tokIs(toks[k], 'tháng') && k > 0) {
      const next = toks[k + 1]
      const named = next
        ? (MONTH_WORDS[next.text] ?? (next.ascii ? { gieng: 1, chap: 12 }[next.strip] : undefined))
        : undefined
      if (named) return named
      const n = next ? Number(next.text) : Number.NaN
      const word = next ? evalNumWord(next) : undefined
      const m = Number.isInteger(n) ? n : word
      if (
        m !== undefined &&
        m >= 1 &&
        m <= 12 &&
        toks.slice(0, k).some((x) => tokIs(x, 'rằm', 'mùng', 'mồng'))
      )
        return m
    }
  }
  return undefined
}

const NUM_WORD: Record<string, number> = {
  một: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
  mười: 10,
}
const evalNumWord = (t: Tok): number | undefined => NUM_WORD[t.text]

const HOW = new Set(['thế nào', 'ra sao', 'như thế nào', 'thế nào vậy', 'sao'])
const PLACE_MARKERS = ['ở', 'tại', 'tỉnh', 'thành phố', 'tp', 'miền', 'vùng', 'khu vực', 'xứ', 'huyện', 'xã']
const REGION_WORDS = [
  'bắc',
  'trung',
  'nam',
  'tây',
  'việt',
  'nước ngoài',
  'mỹ',
  'pháp',
  'nhật',
  'hàn',
  'trung quốc',
]

/**
 * Does the clause name a place we do not know? A content word right after ở / tại / tỉnh /
 * thành phố / miền … that no phrase explains, a capitalised word no place matched, or a region.
 */
function namesUnknownPlace(toks: readonly Tok[], spans: readonly Span[]): boolean {
  const covered = new Set<number>()
  for (const s of spans) for (let k = s.start; k < s.end; k++) covered.add(k)
  const content = (k: number): boolean => {
    const t = toks[k]
    return !!t && /\p{L}/u.test(t.text) && !covered.has(k)
  }
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!
    if (tokIs(t, ...PLACE_MARKERS) && (content(k + 1) || tokIs(toks[k + 1], ...REGION_WORDS))) return true
    if (t.cap && !t.initial && content(k)) return true
  }
  return false
}

const BODY_PARTS = new Set([
  'mắt',
  'tai',
  'chân',
  'tay',
  'lưng',
  'đầu',
  'sức',
  'trí',
  'răng',
  'bụng',
  'gối',
  'tim',
  'người',
])

/** Activities a "dừng / ngừng" names ("dừng nhảy" = stop jumping). */
const STOPPABLE: ReadonlySet<Concept> = new Set<Concept>([
  'JUMP',
  'DANCE',
  'WAVE',
  'NOD',
  'SHAKE',
  'PUNCH',
  'WALK',
  'RUN',
  'TURN',
  'SPIN',
  'BACK',
])

/** Motion words that, right after "quạt", describe the fan running. */
const FAN_MOTION: ReadonlySet<Concept> = new Set<Concept>(['RUN', 'TURN', 'SPIN'])

/** Function-word concepts that carry no command of their own. */
const LIGHTWEIGHT: ReadonlySet<Concept> = new Set<Concept>(['FILLER', 'SFILLER', 'CLASSIFIER', 'QMARK'])

/** Device-ish concepts that may stand alone on the right of "và" ("bật đèn và quạt"). */
export const CARRY_MODS: ReadonlySet<Concept> = new Set<Concept>([
  'LIGHT',
  'FAN',
  'LEFT',
  'RIGHT',
  'COLOR',
  'DEVICE',
])

const COUNTABLE = new Set<Action['type']>(['jump', 'wave', 'nod', 'shake_head', 'thumbs_up', 'punch', 'turn'])
const INFO_OR_CHAT = new Set<Action['type']>([
  'time',
  'date',
  'weekday',
  'lunar',
  'timer_start',
  'timer_cancel',
  'timer_status',
  'weather',
  'math',
  'greet',
  'thanks',
  'goodbye',
  'praise',
  'insult',
  'intro',
  'capabilities',
  'joke',
  'smalltalk',
  'voice',
  'set_language',
  'clarify',
  'emergency',
])
const CONTINUOUS = new Set<Action['type']>(['dance', 'walk', 'run'])

export const has = (s: Span, c: Concept): boolean =>
  s.m.e.concept === c || s.alts.some((a) => a.e.concept === c)
export const matchOf = (s: Span, c: Concept): Match =>
  s.m.e.concept === c ? s.m : (s.alts.find((a) => a.e.concept === c) ?? s.m)

const USER_PRON = new Set<string>(USER_PRONOUNS.map((p) => canonSyl(p)))
const BRIDGE_WORDS = new Set<string>(SUBJECT_BRIDGES.flatMap((b) => b.split(' ')).map((p) => canonSyl(p)))

function clampCount(n: number, max: number, notes: Note[]): number {
  if (!Number.isFinite(n) || n > max) {
    capNote(notes, max)
    return max
  }
  return Math.max(1, Math.round(n))
}

function capNote(notes: Note[], max: number): void {
  if (!notes.some((n) => n.kind === 'capped')) notes.push({ kind: 'capped', data: { max } })
}

export function resolveClause(inp: ClauseInput, ctx: ParseContext, carry: Carry): ClauseOutcome {
  const consumed = new Set<Span>()
  const drafts: Draft[] = []
  const notes: Note[] = []
  const suggestions: Suggestion[] = []
  let missing = false
  const spans = inp.spans

  const free = (c: Concept): Span[] => spans.filter((s) => !consumed.has(s) && has(s, c))
  const first = (c: Concept): Span | undefined => free(c)[0]
  const take = (...ss: (Span | undefined)[]): void => {
    for (const s of ss) if (s) consumed.add(s)
  }
  const takeAll = (...cs: Concept[]): Span[] => {
    const got = cs.flatMap((c) => free(c))
    take(...got)
    return got
  }
  const add = (action: Action, used: Span[], extra: Partial<Draft> = {}): Draft => {
    take(...used)
    const pos = used.length > 0 ? Math.min(...used.map((s) => s.start)) : 0
    const d: Draft = { action, pos, spans: used, source: 'rule', confMul: 1, ...extra }
    drafts.push(d)
    return d
  }
  const dayOffset = (): DayOffset => {
    const d = first('DAY')
    if (!d) return 0
    take(d)
    const v = matchOf(d, 'DAY').e.val
    return v?.k === 'day' ? v.offset : 0
  }
  const questionish = (): boolean => inp.question || free('QMARK').length > 0

  // ------------------------------------------------------------------ math (priority 85)
  if (inp.math) {
    drafts.push({
      action: inp.math.action,
      pos: inp.math.start,
      spans: [],
      source: 'rule',
      confMul: 1,
      mathRange: [inp.math.start, inp.math.end],
    })
  }

  // ------------------------------------------------------------------ timers (80/82/78)
  resolveTimers(inp, ctx, carry, { spans, consumed, free, take, add, suggestions })

  // ------------------------------------------------------------------ lunar (72)
  {
    const tet = first('TET')
    const ram = first('RAM') ?? first('FESTIVAL')
    const mung = first('MUNG1')
    const year = first('LUNAR_YEAR')
    const lunar = first('LUNAR')
    const trig = tet ?? ram ?? mung ?? year ?? lunar
    if (trig) {
      let query: ActionOf<'lunar'>['query'] = 'date'
      // a named festival or lunar month: "Trung Thu", "rằm tháng Giêng", "mùng 1 tháng Chạp"
      const festMonth = festivalMonth(inp.toks)
      if (festMonth !== undefined && !mung) query = 'ram'
      else if (tet) query = 'tet'
      else if (ram) query = 'ram'
      else if (mung) query = matchOf(mung, 'MUNG1').nums[0] === 1 ? 'mung1' : 'date'
      else if (year) query = 'year'
      const used = [trig, ...takeAll('TET', 'RAM', 'MUNG1', 'LUNAR_YEAR', 'LUNAR', 'FESTIVAL')]
      const off = dayOffset()
      used.push(...takeAll('DATE', 'WEEKDAY', 'HOWLONG', 'STATUS', 'QMARK', 'REPEAT'))
      const action: ActionOf<'lunar'> = { type: 'lunar', query, dayOffset: off }
      if ((query === 'ram' || query === 'mung1') && festMonth !== undefined) action.month = festMonth
      if (query === 'year') {
        const yo = yearOffsetOf(inp.toks)
        if (yo) action.yearOffset = yo
      }
      add(action, used)
    }
  }

  // ------------------------------------------------------------------ date / weekday (68/69)
  {
    const date = free('DATE')
    const wd = free('WEEKDAY')
    if (date.length > 0 || wd.length > 0) {
      const off = dayOffset()
      const used = [...date, ...wd, ...takeAll('QMARK')]
      add(date.length > 0 ? { type: 'date', dayOffset: off } : { type: 'weekday', dayOffset: off }, used)
    }
  }

  // ------------------------------------------------------------------ time (70)
  {
    const time = free('TIME')
    if (time.length > 0) add({ type: 'time' }, [...time, ...takeAll('QMARK')])
  }

  // ------------------------------------------------------------------ weather (65)
  {
    // own readings only: "thoi hong mua nua" is múa (dance), not a lattice "mưa"
    const own = (c: Concept): Span[] => free(c).filter((s) => isPrimary(s, c))
    const all = own('WEATHER')
    const explicit = all.filter((s) => matchOf(s, 'WEATHER').e.weight >= 1)
    const weak = all.filter((s) => matchOf(s, 'WEATHER').e.weight < 1)
    const rain = own('RAIN')
    const hot = own('HOTCOLD')
    const sunny = own('SUNNY')
    const place = first('PLACE')
    const day = first('DAY')
    const q =
      questionish() ||
      [...rain, ...hot, ...sunny].some((s) => inp.toks[s.start]?.text === 'có') ||
      place !== undefined ||
      day !== undefined
    const implQ = inp.question || place !== undefined ? [...free('IMPL_HOT'), ...free('IMPL_COLD')] : []
    const aspects = [...rain, ...hot, ...sunny, ...implQ]
    // "Đà Nẵng ngày kia thế nào": a place with "thế nào / ra sao" asks for its weather
    const placeQ = !!place && free('QMARK').some((s) => HOW.has(s.m.e.text))
    if (explicit.length > 0 || ((aspects.length > 0 || weak.length > 0) && q) || placeQ) {
      const tempWords = new Set(['nhiệt độ', 'bao nhiêu độ', 'mấy độ'])
      const aspect: ActionOf<'weather'>['aspect'] =
        rain.length > 0
          ? 'rain'
          : hot.length > 0 ||
              implQ.length > 0 ||
              explicit.some((s) => tempWords.has(matchOf(s, 'WEATHER').e.text))
            ? 'temp'
            : 'general'
      const off = dayOffset()
      const placeRef = (() => {
        if (!place) return null
        const v = matchOf(place, 'PLACE').e.val
        return v?.k === 'place' ? toPlaceRef(v.place) : null
      })()
      const used = [...explicit, ...weak, ...aspects, ...(place ? [place] : []), ...takeAll('QMARK')]
      if (place) take(...free('PLACE'))
      const action: ActionOf<'weather'> = {
        type: 'weather',
        place: placeRef,
        dayOffset: off < 0 ? 0 : (off as 0 | 1 | 2),
        aspect,
      }
      // a place was named that the gazetteer does not know: say so, never answer as if it were it
      if (!place && namesUnknownPlace(inp.toks, spans)) action.placeUnknown = true
      add(action, used)
    }
  }

  // ------------------------------------------------------------------ voice / language (55/56)
  {
    // primary readings only: "bat den cam" is an orange light, not "câm" (mute)
    for (const s of free('MUTE')) if (s.m.e.concept === 'MUTE') add({ type: 'voice', on: false }, [s])
    for (const s of free('UNMUTE')) if (s.m.e.concept === 'UNMUTE') add({ type: 'voice', on: true }, [s])
    const en = first('LANG_EN')
    const vi = first('LANG_VI')
    if (en || vi) {
      const used = [...takeAll('LANG_EN', 'LANG_VI'), ...takeAll('SPEAK')]
      add({ type: 'set_language', lang: en ? 'en' : 'vi' }, used)
    }
  }

  // ------------------------------------------------------------------ unsupported (60/75)
  {
    const homeDevices = free('LIGHT').length + free('FAN').length
    for (const s of spans) {
      if (consumed.has(s)) continue
      if (has(s, 'UNSAFE')) {
        const e = unsupEntry(matchOf(s, 'UNSAFE'))
        if (e) add(unsupported(e), [s])
        continue
      }
      // a refusal reading that lost the DP counts only with an object after it ("mua chuoi")
      const own = s.m.e.concept === 'UNSUP'
      const unsupAlt = !own && has(s, 'UNSUP') && (!isHeadSpan(s) || hasObjectAfter(inp.toks, s.end))
      if ((own || unsupAlt) && !has(s, 'OBJ')) {
        const e = unsupEntry(matchOf(s, 'UNSUP'))
        if (!e) continue
        // the refusal takes the rest of the clause up to the next doable head ("đi chợ mua rau");
        // a bare "# vòng" is the refused verb's own count ("bay hai vòng"), not a spin
        const next = spans.find(
          (x) =>
            x.start >= s.end &&
            !consumed.has(x) &&
            isHeadSpan(x) &&
            !has(x, 'UNSUP') &&
            !has(x, 'DEVICE') &&
            !isCountSpin(x),
        )
        const limit = next ? next.start : inp.toks.length
        const rest = spans.filter((x) => x !== s && !consumed.has(x) && x.start >= s.end && x.end <= limit)
        const action = unsupported(e)
        const obj = findObject(inp.toks, s.end, limit)
        // only a verb that takes the object keeps it ("mua rau"), never "đi chợ rau"
        if (obj && e.withObject) {
          action.object = obj
          action.verb = { ...e.withObject }
        }
        add(action, [s, ...rest])
        continue
      }
      if (has(s, 'DEVICE') && s.m.e.concept === 'DEVICE') {
        const v = s.m.e.val
        if (v?.k !== 'device') continue
        const verbs = [...free('ON'), ...free('OFF'), ...free('CLOSE')]
        const verb = nearest(verbs, s)
        const opens = (OPENABLE as readonly string[]).includes(v.entry.name.vi)
        let label: (typeof DEVICE_VERBS)[keyof typeof DEVICE_VERBS] = DEVICE_VERBS.use
        if (verb) {
          if (has(verb, 'CLOSE')) label = DEVICE_VERBS.close
          else if (has(verb, 'OFF')) label = DEVICE_VERBS.off
          else label = opens && inp.toks[verb.start]?.strip === 'mo' ? DEVICE_VERBS.open : DEVICE_VERBS.on
        }
        const action: ActionOf<'unsupported'> = {
          type: 'unsupported',
          reason: 'device_absent',
          verb: { ...label },
          object: { ...v.entry.name },
        }
        // a verb shared with the lamp/fan ("bật đèn và tivi") stays available for them
        add(action, verb && homeDevices === 0 ? [s, verb] : [s])
      }
    }
  }

  // ------------------------------------------------------------------ home (70)
  resolveHome(inp, ctx, carry, { spans, consumed, free, first, take, add, notes, suggestions, markMissing })

  function markMissing(): void {
    missing = true
  }

  // "chạy nhanh lên" left over by the home rules = run
  for (const s of spans) {
    const c = s.m.e.concept
    if (!consumed.has(s) && (c === 'SPEED_UP' || c === 'SPEED_DOWN') && s.m.e.text.startsWith('chạy'))
      add({ type: 'run', seconds: 3 }, [s])
  }

  // ------------------------------------------------------------------ motion + conversation heads
  resolveHeads(inp, ctx, { spans, consumed, take, add, drafts })

  // ------------------------------------------------------------------ modifiers
  attachModifiers(carry, { spans, consumed, take, add, drafts, notes, free, toks: inp.toks })

  // "tắt đèn sau 5 phút": a delayed lamp/fan command cannot be scheduled yet — switch nothing now
  {
    const late = free('DURATION')
    const devs = drafts.filter((d) => d.action.type === 'light' || d.action.type === 'fan')
    const dev = devs[0]
    if (late.length > 0 && dev && (dev.action.type === 'light' || dev.action.type === 'fan')) {
      const device = dev.action.type
      const power = dev.action.power === 'off' ? 'off' : 'on'
      for (const d of devs) drafts.splice(drafts.indexOf(d), 1)
      add({ type: 'clarify', need: 'device_later', device, power }, [
        ...devs.flatMap((d) => d.spans),
        ...late,
      ])
      suggestions.push(deviceChip(device, power))
    }
  }

  // ------------------------------------------------------------------ repeat (30)
  if (drafts.length === 0 && !missing) {
    const rep = free('REPEAT')
    const again = free('COUNT').filter((s) => {
      const v = matchOf(s, 'COUNT').e.val
      return v?.k === 'count' && 'again' in v.value && v.value.again === true
    })
    if (rep.length > 0 || again.length > 0) {
      const countSpan = free('COUNT')[0]
      let n: number | undefined
      if (countSpan) {
        const m = matchOf(countSpan, 'COUNT')
        const v = m.e.val
        if (v?.k === 'count') {
          if (v.value.kind === 'num') n = m.nums[0]
          else if (v.value.kind === 'fixed' && !v.value.again) n = v.value.n
          else if (v.value.kind === 'forever') n = Number.POSITIVE_INFINITY
        }
      }
      const used = [...rep, ...free('COUNT')]
      take(...used)
      if (ctx.lastActions.length === 0) {
        notes.push({ kind: 'nothing_to_repeat' })
      } else {
        for (const a of expandRepeat(ctx.lastActions, n, notes)) {
          drafts.push({ action: a, pos: used[0]?.start ?? 0, spans: used, source: 'repeat', confMul: 1 })
        }
      }
    }
  }

  // ------------------------------------------------------------------ negation (spec §6)
  const neg = spans.find((s) => has(s, 'NEG') && !consumed.has(s))
  // "sao (bạn) không nhảy?", "răng mi không bật đèn": why don't you X = please X, not "don't"
  const why = !!neg && spans.some((s) => s.end <= neg.start && s.m.e.text === 'sao' && isPrimary(s, 'QMARK'))
  if (neg && why) take(neg)
  else if (neg) {
    take(neg)
    for (const d of drafts) {
      if (d.pos < neg.end || d.source === 'repeat') continue
      if (INFO_OR_CHAT.has(d.action.type)) continue // "hổng biết mấy giờ rồi" → still the time
      const ongoing =
        inp.hadNua ||
        (CONTINUOUS.has(d.action.type) && ctx.robot.activity !== 'idle') ||
        (d.action.type === 'dance' && ctx.robot.activity === 'dancing')
      if (d.action.type === 'emote') {
        // "đừng khóc", "đừng buồn nữa", "đừng giận nhé": about that emotion, never "stopped"
        d.action = { type: 'ack_negation', target: 'emote', emotion: d.action.emotion }
      } else if (
        ongoing &&
        d.action.type !== 'light' &&
        d.action.type !== 'fan' &&
        d.action.type !== 'unsupported'
      ) {
        d.action = { type: 'stop' }
      } else {
        d.action = { type: 'ack_negation', target: d.action.type }
      }
      d.negated = true
    }
  }

  drafts.sort((a, b) => a.pos - b.pos)
  return { drafts, notes, suggestions, missing, consumed }
}

// ------------------------------------------------------------------------------------ timers

interface TimerTools extends Tools {
  free: (c: Concept) => Span[]
  suggestions: Suggestion[]
}

/** The span's own reading is `c`, or `c` ties with it (an alternative far below never triggers). */
function isPrimary(s: Span, c: Concept): boolean {
  if (s.m.e.concept === c) return true
  const alt = s.alts.find((a) => a.e.concept === c)
  return !!alt && alt.score >= s.m.score - 0.01
}

const tokIs = (t: Tok | undefined, ...words: string[]): boolean =>
  !!t && words.some((w) => t.text === w || (t.ascii && t.strip === strip(w)))

const PART_OF_DAY = ['sáng', 'trưa', 'chiều', 'tối', 'đêm', 'khuya']

/** A part-of-day word; without diacritics "toi"/"sang" are tôi/sang unless the context says time. */
function partOfDayAt(toks: readonly Tok[], k: number): boolean {
  const t = toks[k]!
  if (!tokIs(t, ...PART_OF_DAY)) return false
  if (!t.ascii || t.strip === 'khuya' || t.strip === 'trua' || t.strip === 'chieu') return true
  const prev = toks[k - 1]
  return tokIs(prev, 'giờ', 'buổi') || /^\d/.test(prev?.text ?? '') || tokIs(toks[k + 1], 'nay', 'mai')
}
const ROOM_DEVICES: ReadonlySet<Concept> = new Set<Concept>(['LIGHT', 'FAN'])

/** "lúc 9 giờ", "6 giờ sáng mai", "9 giờ 30 tối", "báo thức 6 giờ": a clock time, not a duration. */
function isClockTime(toks: readonly Tok[], durs: readonly Span[], trig: readonly Span[]): boolean {
  const alarm = trig.some((s) => s.m.e.text.includes('báo thức'))
  for (const d of durs) {
    let hour = -1
    for (let k = d.start; k < d.end; k++) if (tokIs(toks[k], 'giờ')) hour = k
    if (hour < 0) continue
    const prev = toks[d.start - 1]
    if (tokIs(prev, 'lúc', 'đúng', 'vào')) return true
    let k = d.end
    while (k < toks.length && (/^\d/.test(toks[k]!.text) || tokIs(toks[k], 'phút', 'rưỡi', 'kém', 'đúng')))
      k++
    if (tokIs(toks[k], 'mai') || (k < toks.length && tokIs(toks[k], ...PART_OF_DAY))) return true
    if (alarm && !tokIs(prev, 'sau', 'trong') && !tokIs(toks[d.end], 'nữa')) return true
  }
  return false
}

const timerChip = (say: string, en: string): Suggestion => ({ say, label: { vi: say, en } })

function askChips(label: string | undefined, plain: boolean): Suggestion[] {
  if (label)
    return [
      timerChip(`nhắc tôi ${label} sau 15 phút`, 'Reminder in 15 minutes'),
      timerChip(`nhắc tôi ${label} sau 30 phút`, 'Reminder in 30 minutes'),
    ]
  if (plain)
    return [timerChip('hẹn giờ 5 phút', '5-minute timer'), timerChip('hẹn giờ 15 phút', '15-minute timer')]
  return [
    timerChip('nhắc tôi sau 15 phút', 'Remind me in 15 minutes'),
    timerChip('nhắc tôi uống thuốc sau 30 phút', 'Medicine reminder in 30 minutes'),
  ]
}

function deviceChip(device: 'light' | 'fan', power: 'on' | 'off'): Suggestion {
  const say = `${power === 'off' ? 'tắt' : 'bật'} ${device === 'fan' ? 'quạt' : 'đèn'}`
  const en = `${device === 'fan' ? 'Fan' : 'Light'} ${power}`
  return timerChip(say, en)
}

/**
 * Timers and reminders (spec §4.3): start / cancel / status, plus the honest answers for what the
 * robot cannot schedule yet. Everything after the trigger belongs to the reminder ("nhắc tôi tắt
 * bếp" never refuses "tắt bếp"); a cancel verb counts only when it governs the timer word.
 */
function resolveTimers(inp: ClauseInput, ctx: ParseContext, carry: Carry, t: TimerTools): void {
  const { spans, consumed, free, add, suggestions } = t
  const toks = inp.toks
  const n = toks.length
  const primary = (c: Concept): Span[] => free(c).filter((s) => isPrimary(s, c))
  const timer = primary('TIMER')
  const wakeMe = primary('WAKE_ME')
  const trig = [...timer, ...primary('REMIND'), ...wakeMe].sort((a, b) => a.start - b.start)
  const durs = free('DURATION')
  const lunarish = ['TET', 'RAM', 'LUNAR', 'MUNG1', 'FESTIVAL'].some((c) => free(c as Concept).length > 0)
  const carried = trig.length === 0 && carry.timer === true && durs.length > 0
  if (trig.length === 0 && !carried) {
    // "bao lâu nữa thì uống thuốc" (a reminder is running): the status, not a refusal
    const howlong = free('HOWLONG').find((s) => s.m.e.text === 'bao lâu')
    const lbl = findTimerLabelAt(toks, 0, n)
    const status = firstOf(free('STATUS'))
    if ((status || (howlong && lbl)) && !lunarish) {
      const used = [...free('STATUS'), ...(howlong ? [howlong] : [])]
      if (lbl) used.push(...spans.filter((s) => !consumed.has(s) && s.start < lbl.end && s.end > lbl.start))
      add({ type: 'timer_status' }, used)
    }
    return
  }
  const lo = trig.length > 0 ? trig[0]!.start : durs[0]!.start
  const trigEnd = trig.length > 0 ? Math.max(...trig.map((s) => s.end)) : lo
  const labelAt = findTimerLabelAt(toks, trigEnd, n) ?? findTimerLabelAt(toks, 0, lo)
  const labelSpans = labelAt
    ? spans.filter((s) => !consumed.has(s) && s.start < labelAt.end && s.end > labelAt.start)
    : []
  /** The reminder owns the rest of the clause (and its label / time words before the trigger). */
  const owned = (): Span[] =>
    spans.filter(
      (s) =>
        !consumed.has(s) &&
        (s.start >= lo ||
          labelSpans.includes(s) ||
          durs.includes(s) ||
          !isHeadSpan(s) ||
          has(s, 'REPEAT') ||
          has(s, 'DAY')),
    )

  // ---- cancel: "hủy (cái) hẹn giờ", "tắt báo thức", "hẹn giờ hủy đi", "đừng nhắc tôi nữa"
  const cancelish = (s: Span | undefined): boolean =>
    !!s && !consumed.has(s) && (has(s, 'CANCEL') || has(s, 'OFF') || has(s, 'STOP'))
  let verb: Span | undefined
  for (const tr of trig) {
    // the verb right before the timer word, over fillers ("hủy dùm cái hẹn giờ", "hủy hết hẹn giờ")
    const before = spans.filter((x) => x.end <= tr.start).reverse()
    let gap: Span | undefined
    for (const x of before.slice(0, 4)) {
      if (LIGHTWEIGHT.has(x.m.e.concept) && !cancelish(x) && !has(x, 'NEG')) continue
      gap = x
      break
    }
    // "đừng nhắc tôi nữa" / "thôi khỏi hẹn giờ" (one is running) stop them; "đừng hẹn giờ" alone
    // with nothing running is just "no timer" (ack below)
    const negCancel = !!gap && has(gap, 'NEG') && !consumed.has(gap) && durs.length === 0
    if (gap && cancelish(gap)) verb = gap
    else if (negCancel && (!timer.includes(tr) || inp.hadNua || ctx.timers.length > 0)) verb = gap
    else if (negCancel) {
      add({ type: 'ack_negation', target: 'timer_start' }, [gap!, ...trig], { negated: true })
      return
    }
    const after = spans.find((x) => x.start === tr.end)
    const rest = spans.filter((x) => x.start > tr.end && !LIGHTWEIGHT.has(x.m.e.concept))
    if (!verb && cancelish(after) && rest.length === 0) verb = after
    if (verb) break
  }
  if (verb) {
    const action: ActionOf<'timer_cancel'> = { type: 'timer_cancel' }
    if (labelAt) action.label = labelAt.label
    add(action, [verb, ...owned()])
    return
  }

  // ---- status: "hẹn giờ còn bao lâu"
  if (firstOf(free('STATUS')) && !lunarish) {
    add({ type: 'timer_status' }, [...free('STATUS'), ...trig, ...labelSpans])
    return
  }

  const label = labelAt?.label ?? (wakeMe.length > 0 ? 'thức dậy' : undefined)
  const withLabel = <T extends { label?: string }>(a: T): T => (label ? { ...a, label } : a)
  // the reminder's content is the room lamp / fan ("hẹn giờ 10 phút tắt đèn"): not schedulable yet
  const device = spans.find((s) => s.start >= trigEnd && !consumed.has(s) && ROOM_DEVICES.has(s.m.e.concept))
  const devVerb = device
    ? spans.find((s) => s.start >= trigEnd && !consumed.has(s) && (has(s, 'ON') || has(s, 'OFF')))
    : undefined
  if (device && devVerb && trig.length > 0) {
    const dev = device.m.e.concept === 'FAN' ? 'fan' : 'light'
    const power = has(devVerb, 'OFF') && devVerb.m.e.concept !== 'ON' ? 'off' : 'on'
    add({ type: 'clarify', need: 'device_later', device: dev, power }, owned())
    suggestions.push(deviceChip(dev, power))
    return
  }

  const dayWords =
    free('DAY').some((s) => {
      const v = matchOf(s, 'DAY').e.val
      return v?.k === 'day' && v.offset !== 0
    }) || toks.some((_, k) => partOfDayAt(toks, k))
  if (isClockTime(toks, durs, trig) || (durs.length === 0 && dayWords && trig.length > 0)) {
    add(withLabel({ type: 'clarify', need: 'clock_time' } as ActionOf<'clarify'>), owned())
    suggestions.push(
      label
        ? timerChip(`nhắc tôi ${label} sau 30 phút`, 'Reminder in 30 minutes')
        : timerChip('hẹn giờ 30 phút', '30-minute timer'),
    )
    return
  }

  if (durs.length === 0) {
    add(withLabel({ type: 'clarify', need: 'timer_duration' } as ActionOf<'clarify'>), owned())
    suggestions.push(...askChips(label, timer.length > 0 && !label))
    return
  }

  // ---- start: one timer per trigger that has its own duration ("hẹn giờ 1 phút hẹn giờ 2 phút")
  const segments: { from: number; to: number }[] = []
  const withDur = trig.filter((tr, k) => {
    const to = trig[k + 1]?.start ?? n
    return durs.some((d) => d.start >= tr.start && d.start < to)
  })
  if (withDur.length >= 2) {
    withDur.forEach((tr, k) =>
      segments.push({ from: k === 0 ? 0 : tr.start, to: withDur[k + 1]?.start ?? n }),
    )
  } else segments.push({ from: 0, to: n })
  const all = owned()
  segments.forEach((seg, k) => {
    const mine = durs.filter((d) => d.start >= seg.from && d.start < seg.to)
    // only adjacent pieces add up ("1 tiếng 30 phút")
    const group: Span[] = []
    for (const d of mine) if (group.length === 0 || d.start === group[group.length - 1]!.end) group.push(d)
    let seconds = group.reduce((sum, d) => sum + durationOf(d), 0)
    seconds = Math.min(LIMITS.maxTimerSeconds, Math.max(1, Math.round(seconds)))
    const segLabel = segments.length > 1 ? findTimerLabelAt(toks, seg.from, seg.to)?.label : label
    const action: ActionOf<'timer_start'> = { type: 'timer_start', seconds }
    if (segLabel) action.label = segLabel
    add(
      action,
      all.filter((s) => (segments.length === 1 ? true : s.start >= seg.from && s.start < seg.to)),
      { source: carried ? 'carry' : 'rule', confMul: carried ? 0.9 : 1 },
    )
    void k
  })
}

const firstOf = <T>(xs: readonly T[]): T | undefined => xs[0]

// ================================================================================ helpers

function isHeadSpan(s: Span): boolean {
  return HEADS.has(s.m.e.concept)
}

/** A whitelisted object follows (within three words): "mua (một) quả chuối". */
function hasObjectAfter(toks: readonly Tok[], from: number): boolean {
  return findObject(toks, from, Math.min(toks.length, from + 3)) !== undefined
}

/** "hai vòng" alone: a count of rounds for the verb before it. */
function isCountSpin(s: Span): boolean {
  return s.m.e.concept === 'SPIN' && s.m.e.elems[0] === null
}

function nearest(cands: readonly Span[], to: Span): Span | undefined {
  let best: Span | undefined
  let bestD = Number.POSITIVE_INFINITY
  for (const c of cands) {
    const d = c.end <= to.start ? to.start - c.end : c.start >= to.end ? c.start - to.end + 0.5 : 0
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

function unsupEntry(m: Match): UnsupportedEntry | undefined {
  const v = m.e.val
  return v?.k === 'unsup' ? v.entry : undefined
}

function unsupported(e: UnsupportedEntry): ActionOf<'unsupported'> {
  const a: ActionOf<'unsupported'> = { type: 'unsupported', reason: e.reason, verb: { ...e.verb } }
  if (e.alternative) a.alternative = structuredClone(e.alternative)
  return a
}

function durationOf(s: Span): number {
  const m = matchOf(s, 'DURATION')
  const v = m.e.val
  if (v?.k !== 'dur') return 0
  if (v.halfOnly) return v.unit / 2
  return (m.nums[0] ?? 1) * v.unit + (v.half ? v.unit / 2 : 0)
}

function expandRepeat(last: readonly Action[], n: number | undefined, notes: Note[]): Action[] {
  const base = last.filter((a) => a.type !== 'ack_negation')
  if (base.length === 0) return []
  if (n === undefined) return base.map((a) => structuredClone(a))
  if (base.length === 1 && 'count' in base[0]!) {
    const a = structuredClone(base[0]!) as Action & { count: number }
    a.count = clampCount(n, a.type === 'turn' ? LIMITS.maxSpins : LIMITS.maxCount, notes)
    return [a]
  }
  const times = clampCount(n, LIMITS.maxCount, notes)
  const out: Action[] = []
  for (let k = 0; k < times && out.length < LIMITS.maxActions; k++) {
    for (const a of base) if (out.length < LIMITS.maxActions) out.push(structuredClone(a))
  }
  return out
}

interface Tools {
  spans: Span[]
  consumed: Set<Span>
  take: (...ss: (Span | undefined)[]) => void
  add: (action: Action, used: Span[], extra?: Partial<Draft>) => Draft
}

// ------------------------------------------------------------------------------------- home

interface HomeTools extends Tools {
  free: (c: Concept) => Span[]
  first: (c: Concept) => Span | undefined
  notes: Note[]
  suggestions: Suggestion[]
  markMissing: () => void
}

function resolveHome(inp: ClauseInput, ctx: ParseContext, carry: Carry, t: HomeTools): void {
  const { free, take, add, notes, suggestions } = t
  const verbsAll = [...free('ON'), ...free('OFF')].sort((a, b) => a.start - b.start)
  const verbOf = (s: Span): 'on' | 'off' => (has(s, 'OFF') && s.m.e.concept !== 'ON' ? 'off' : 'on')
  const colors = free('COLOR')
  const kws = free('COLOR_KW')
  const speeds = free('FAN_SPEED')
  // "chạy nhanh lên" is the robot running unless the fan is named ("quạt chạy nhanh lên")
  const fanNamed = free('FAN').length > 0 || carry.device === 'fan'
  const notRun = (s: Span): boolean => fanNamed || !s.m.e.text.startsWith('chạy')
  const ups = free('SPEED_UP').filter(notRun)
  const downs = free('SPEED_DOWN').filter(notRun)

  type Dev = { kind: 'light' | 'fan'; span: Span | null; pos: number }
  const devices: Dev[] = []
  for (const s of free('LIGHT')) {
    // "đen" read as a colour first is only the lamp ("đèn") when a switch verb is there ("bật đen")
    if (s.m.e.concept === 'COLOR' && verbsAll.length === 0) continue
    devices.push({ kind: 'light', span: s, pos: s.start })
  }
  for (const s of free('FAN')) devices.push({ kind: 'fan', span: s, pos: s.start })
  devices.sort((a, b) => a.pos - b.pos)
  const colorHasMau = colors.some((c) => inp.toks[c.start]?.text === 'màu')
  // a bare colour ("xanh lá", "màu đỏ") answers "xanh lá hay xanh dương?": it is about the lamp
  const colorOnly =
    colors.length > 0 &&
    t.spans.every((s) => has(s, 'COLOR') || s.m.e.concept === 'COLOR_KW' || LIGHTWEIGHT.has(s.m.e.concept))
  if (
    !devices.some((d) => d.kind === 'light') &&
    colors.length > 0 &&
    (kws.length > 0 || verbsAll.length > 0 || colorHasMau || colorOnly)
  ) {
    devices.push({ kind: 'light', span: null, pos: colors[0]!.start })
  }
  if (
    !devices.some((d) => d.kind === 'fan') &&
    (speeds.length > 0 ||
      ((ups.length > 0 || downs.length > 0) && (carry.device === 'fan' || ctx.room.fan.on)))
  ) {
    devices.push({ kind: 'fan', span: null, pos: (speeds[0] ?? ups[0] ?? downs[0])!.start })
  }

  const usedVerbs = new Set<Span>()
  for (const d of devices) {
    const anchor = d.span ?? colors[0] ?? speeds[0] ?? ups[0] ?? downs[0]!
    const verb = nearest(verbsAll, anchor)
    let v: 'on' | 'off' | undefined = verb ? verbOf(verb) : undefined
    let source: Draft['source'] = 'rule'
    if (!verb && verbsAll.length === 0 && carry.verb && !d.span?.m.e.text.startsWith('màu')) {
      v = carry.verb
      source = 'carry'
    }
    if (verb) usedVerbs.add(verb)
    const used: Span[] = [...(d.span ? [d.span] : []), ...(verb ? [verb] : [])]
    if (d.kind === 'light') {
      const color = nearest(
        colors.filter((c) => c !== d.span),
        anchor,
      )
      const cv = color ? matchOf(color, 'COLOR').e.val : undefined
      if (color) used.push(color, ...kws)
      else used.push(...kws)
      let action: ActionOf<'light'> | null = null
      if (v === 'off') action = { type: 'light', power: 'off' }
      else if (cv?.k === 'color' && cv.value === 'black') {
        if (v === 'on' && !d.span && kws.length === 0 && !colorHasMau)
          action = { type: 'light', power: 'on' } // "bật đen" = typo
        else {
          action = { type: 'light', power: 'off' }
          if (!notes.some((n) => n.kind === 'black_is_off')) notes.push({ kind: 'black_is_off' })
        }
      } else if (cv?.k === 'color' && cv.value !== 'black') {
        action = { type: 'light', power: 'on', color: cv.value }
        if (cv.ambiguous) {
          if (!notes.some((n) => n.kind === 'xanh_ambiguous')) notes.push({ kind: 'xanh_ambiguous' })
          suggestions.push(...SLOT_SUGGESTIONS.xanh)
        }
      } else if (v === 'on') action = { type: 'light', power: 'on' }
      if (action) add(action, used, { source, confMul: source === 'carry' ? 0.85 : 1 })
      else {
        take(...used)
        suggestions.push(
          ...(ctx.room.light.on ? SLOT_SUGGESTIONS.light.slice().reverse() : SLOT_SUGGESTIONS.light),
        )
        t.markMissing()
      }
    } else {
      const action: ActionOf<'fan'> = { type: 'fan' }
      if (v === 'off') action.power = 'off'
      else {
        if (v === 'on') action.power = 'on'
        const sp = speeds[0]
        if (sp) {
          const n = matchOf(sp, 'FAN_SPEED').nums[0] ?? 2
          action.power = 'on'
          action.speed = Math.min(3, Math.max(1, Math.round(n))) as FanSpeed
          used.push(sp)
        }
        if (ups.length > 0) {
          action.speedDelta = 1
          used.push(...ups)
        } else if (downs.length > 0) {
          action.speedDelta = -1
          used.push(...downs)
        }
        // "quạt quay đi", "cho quạt chạy": the fan's own motion means "on"
        const spin = d.span
          ? t.spans.find(
              (x) => x.start === d.span!.end && !t.consumed.has(x) && FAN_MOTION.has(x.m.e.concept),
            )
          : undefined
        // the fan's own motion is never the robot's ("cho quạt chạy số hai")
        if (spin) {
          if (Object.keys(action).length === 1) action.power = 'on'
          used.push(spin)
        }
      }
      if (Object.keys(action).length > 1)
        add(action, used, { source, confMul: source === 'carry' ? 0.85 : 1 })
      else {
        take(...used)
        suggestions.push(...(ctx.room.fan.on ? SLOT_SUGGESTIONS.fan.slice().reverse() : SLOT_SUGGESTIONS.fan))
        t.markMissing()
      }
    }
  }

  // a verb with no device ("bật lên", "tắt đi")
  const orphan = verbsAll.filter((s) => !usedVerbs.has(s) && !t.consumed.has(s))
  if (devices.length === 0 && orphan.length > 0) {
    const verb = orphan[0]!
    const v = verbOf(verb)
    const ringing = ctx.timers.some((x) => x.ringing)
    const all = matchOf(verb, v === 'off' ? 'OFF' : 'ON').e.text.endsWith(' hết')
    if (all) {
      // "tắt hết" / "bật hết": both devices
      add({ type: 'light', power: v }, [verb])
      add({ type: 'fan', power: v }, [verb])
    } else if (carry.device) {
      const dev = carry.device
      add(dev === 'light' ? { type: 'light', power: v } : { type: 'fan', power: v }, [verb], {
        source: 'carry',
        confMul: 0.85,
      })
    } else if (v === 'off' && ringing) {
      add({ type: 'timer_cancel' }, [verb])
    } else if (v === 'off' && ctx.room.light.on !== ctx.room.fan.on) {
      add(ctx.room.light.on ? { type: 'light', power: 'off' } : { type: 'fan', power: 'off' }, [verb], {
        source: 'implicit',
        confMul: 0.85,
      })
    } else {
      take(verb)
      suggestions.push(...(v === 'on' ? SLOT_SUGGESTIONS.device_on : SLOT_SUGGESTIONS.device_off))
      t.markMissing()
    }
  }

  // implicit wishes: "tối quá" → light on; "nóng quá" → fan on; "lạnh quá" → fan off
  for (const s of free('IMPL_DARK'))
    add({ type: 'light', power: 'on' }, [s], { source: 'implicit', confMul: 0.85 })
  for (const s of free('IMPL_HOT'))
    add({ type: 'fan', power: 'on' }, [s], { source: 'implicit', confMul: 0.85 })
  for (const s of free('IMPL_COLD'))
    add({ type: 'fan', power: 'off' }, [s], { source: 'implicit', confMul: 0.85 })
  void notes
}

// ------------------------------------------------------------------------------------ heads

interface HeadTools extends Tools {
  drafts: Draft[]
}

const EMOTION: Partial<Record<Concept, Emotion>> = {
  SAD: 'sad',
  ANGRY: 'angry',
  SURPRISE: 'surprised',
  HAPPY: 'happy',
}

function hasUserSubject(toks: readonly Tok[], start: number): boolean {
  let k = start - 1
  let hops = 0
  while (k >= 0 && hops < 3 && BRIDGE_WORDS.has(toks[k]!.text)) {
    k--
    hops++
  }
  return k >= 0 && USER_PRON.has(toks[k]!.text)
}

function resolveHeads(inp: ClauseInput, ctx: ParseContext, t: HeadTools): void {
  const { spans, consumed, take, add } = t
  const ordered = spans.filter((s) => !consumed.has(s))
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]!
    if (consumed.has(s)) continue
    const c = s.m.e.concept
    if (!HEADS.has(c)) continue
    const text = s.m.e.text
    const prev = spans.filter((x) => x.end <= s.start).at(-1)
    const prevIsHead = !!prev && prev.end === s.start && HEADS.has(prev.m.e.concept)
    const next = ordered[i + 1]
    switch (c) {
      case 'JUMP':
        add({ type: 'jump', count: 1 }, [s])
        break
      case 'DANCE':
        add({ type: 'dance', seconds: 6 }, [s])
        break
      case 'WAVE':
        add({ type: 'wave', count: 1 }, [s])
        break
      case 'NOD':
        add({ type: 'nod', count: 1 }, [s])
        break
      case 'SHAKE':
        add({ type: 'shake_head', count: 1 }, [s])
        break
      case 'THUMB':
        add({ type: 'thumbs_up', count: 1 }, [s])
        break
      case 'PUNCH':
        add({ type: 'punch', count: 1 }, [s])
        break
      case 'WALK':
        // a bare "đi" right after another verb is a particle ("nhảy đi vẫy tay")
        if (text === 'đi' && prevIsHead) {
          take(s)
          break
        }
        // "đi đâu vậy?", "đi mô rứa?" (where are you going — a greeting) is a question, not a walk
        if (text === 'đi' && tokIs(inp.toks[s.end], 'đâu', 'nào')) {
          take(s)
          break
        }
        add({ type: 'walk', direction: 'forward', steps: 3 }, [s])
        break
      case 'BACK':
        add({ type: 'walk', direction: 'backward', steps: 3 }, [s], { fixedDir: true })
        break
      case 'WALK_USER':
        add({ type: 'walk', direction: 'to_user', steps: 3 }, [s], { fixedDir: true })
        break
      case 'WALK_HOME':
        add({ type: 'walk', direction: 'home', steps: 3 }, [s], { fixedDir: true })
        break
      case 'RUN':
        add({ type: 'run', seconds: 3 }, [s])
        break
      case 'TURN': {
        // "quay lại đây" = come here: the turn is implied by the walk
        if (next && next.start === s.end && (has(next, 'WALK_USER') || has(next, 'WALK_HOME'))) {
          take(s)
          break
        }
        if (next && next.start === s.end && has(next, 'SPIN')) {
          const n = matchOf(next, 'SPIN').nums[0] ?? 1
          add({ type: 'turn', direction: 'spin', count: n }, [s, next], { fixedDir: true })
          break
        }
        // "quay phải 2 vòng": a full spin has no side
        const after = ordered[i + 2]
        const side = next && next.start === s.end && (has(next, 'LEFT') || has(next, 'RIGHT'))
        if (side && after && after.start === next.end && has(after, 'SPIN')) {
          const n = matchOf(after, 'SPIN').nums[0] ?? 1
          add({ type: 'turn', direction: 'spin', count: n }, [s, next, after], { fixedDir: true })
          break
        }
        if (next && next.start === s.end && has(next, 'AROUND')) {
          add({ type: 'turn', direction: 'around', count: 1 }, [s, next], { fixedDir: true })
          break
        }
        add({ type: 'turn', direction: 'around', count: 1 }, [s])
        break
      }
      case 'AROUND':
        add({ type: 'turn', direction: 'around', count: 1 }, [s], { fixedDir: true })
        break
      case 'SPIN':
        add({ type: 'turn', direction: 'spin', count: s.m.nums[0] ?? 1 }, [s], { fixedDir: true })
        break
      case 'SIT':
        add({ type: 'sit' }, [s])
        break
      case 'STAND': {
        const bare = text === 'đứng'
        const p = ctx.robot.posture
        if (bare && p !== 'sitting' && p !== 'lying' && ctx.robot.activity !== 'idle')
          add({ type: 'stop' }, [s])
        else if (p === 'sleeping' && !bare) add({ type: 'wake' }, [s])
        else add({ type: 'stand' }, [s])
        break
      }
      case 'SLEEP':
        if (text === 'buồn ngủ' && hasUserSubject(inp.toks, s.start))
          add({ type: 'smalltalk', topic: 'user_tired' }, [s])
        else add({ type: 'sleep' }, [s])
        break
      case 'WAKE': {
        const p = ctx.robot.posture
        if (p === 'sleeping') add({ type: 'wake' }, [s])
        else if (p === 'sitting' || p === 'lying') add({ type: 'stand' }, [s])
        else add({ type: 'wake' }, [s])
        break
      }
      case 'FALL':
        // "bà bị ngã rồi", "tôi té": the USER fell — a possible emergency, never the fall gag
        if (hasUserSubject(inp.toks, s.start)) add({ type: 'emergency' }, [s])
        else add({ type: 'fall' }, [s])
        break
      case 'EMERGENCY':
        add({ type: 'emergency' }, [s])
        break
      case 'STOP':
        // a bare "thôi" with other verbs around is a particle ("thôi nhảy đi", "thôi khỏi hẹn giờ")
        if (
          text === 'thôi' &&
          (t.drafts.length > 0 ||
            ordered.some((x) => x !== s && HEADS.has(x.m.e.concept) && !consumed.has(x)))
        ) {
          take(s)
          break
        }
        {
          const d = add({ type: 'stop' }, [s])
          // "dừng nhảy", "dừng múa lại", "ngừng chạy": what to stop, not a new command
          if (next && next.start === s.end && STOPPABLE.has(next.m.e.concept)) {
            take(next)
            d.spans.push(next)
          }
        }
        break
      case 'SAD':
      case 'ANGRY':
      case 'SURPRISE':
      case 'HAPPY': {
        if (hasUserSubject(inp.toks, s.start) && (c === 'SAD' || c === 'HAPPY')) {
          add({ type: 'smalltalk', topic: c === 'SAD' ? 'user_sad' : 'user_happy' }, [s])
        } else add({ type: 'emote', emotion: EMOTION[c]! }, [s])
        break
      }
      case 'TIRED':
        add({ type: 'smalltalk', topic: 'user_tired' }, [s])
        break
      case 'GREET':
        // "vẫy tay chào mọi người" is one wave, not a wave plus a greeting
        if (prev && prev.end === s.start && prev.m.e.concept === 'WAVE') {
          take(s)
          break
        }
        add({ type: 'greet' }, [s])
        break
      case 'THANKS':
        add({ type: 'thanks' }, [s])
        break
      case 'BYE':
        add({ type: 'goodbye' }, [s])
        break
      case 'PRAISE':
        add({ type: 'praise' }, [s])
        break
      case 'INSULT':
        // "mắt bà kém lắm", "chân tôi yếu": about a body part, not the robot
        if (inp.toks.slice(0, s.start).some((x) => BODY_PARTS.has(x.text))) {
          take(s)
          break
        }
        add({ type: 'insult' }, [s])
        break
      case 'WHO':
        // "mô hình của bạn là gì" asks about the project, not who the robot is
        if (spans.some((x) => has(x, 'PROJECT'))) {
          take(s)
          break
        }
        add({ type: 'intro', topic: 'who' }, [s])
        break
      case 'CREATOR':
        add({ type: 'intro', topic: 'creator' }, [s])
        break
      case 'AGE':
        add({ type: 'intro', topic: 'age' }, [s])
        break
      case 'PROJECT':
        add({ type: 'intro', topic: 'project' }, [s])
        break
      case 'HOWRU':
        add({ type: 'smalltalk', topic: 'how_are_you' }, [s])
        break
      case 'LOVE':
        add({ type: 'smalltalk', topic: 'love' }, [s])
        break
      case 'CAPS':
        add({ type: 'capabilities' }, [s])
        break
      case 'JOKE':
        add({ type: 'joke' }, [s])
        break
      case 'REPEAT':
        // "nhảy lại" = jump again: the particle belongs to the verb before it
        if (prevIsHead) take(s)
        break
      default:
        break
    }
  }
}

// -------------------------------------------------------------------------------- modifiers

interface ModTools extends HeadTools {
  notes: Note[]
  free: (c: Concept) => Span[]
  toks: readonly Tok[]
}

function nearestDraft(drafts: readonly Draft[], s: Span, ok: (d: Draft) => boolean): Draft | undefined {
  const before = drafts.filter((d) => ok(d) && d.pos < s.start).sort((a, b) => b.pos - a.pos)[0]
  if (before) return before
  return drafts.filter((d) => ok(d) && d.pos >= s.end).sort((a, b) => a.pos - b.pos)[0]
}

function attachModifiers(carry: Carry, t: ModTools): void {
  const { drafts, notes, free, take } = t
  // counts: "nhảy ba lần", "gật đầu hai cái", "3 lần nhảy"
  for (const s of free('COUNT')) {
    const d = nearestDraft(drafts, s, (x) => COUNTABLE.has(x.action.type) && x.source !== 'repeat')
    if (!d) continue
    const m = matchOf(s, 'COUNT')
    const v = m.e.val
    if (v?.k !== 'count') continue
    const raw =
      v.value.kind === 'num'
        ? (m.nums[0] ?? 1)
        : v.value.kind === 'fixed'
          ? v.value.n
          : Number.POSITIVE_INFINITY
    const a = d.action as Action & { count: number }
    a.count = clampCount(
      raw,
      a.type === 'turn' && (a as ActionOf<'turn'>).direction === 'spin' ? LIMITS.maxSpins : LIMITS.maxCount,
      notes,
    )
    d.spans.push(s)
    take(s)
  }
  // a bare number right after a countable verb ("nhảy 3"), not a person ("vẫy tay chào ba")
  for (const s of free('NUM')) {
    const d = drafts.find((x) => COUNTABLE.has(x.action.type) && x.spans.some((y) => y.end === s.start))
    if (!d) continue
    if (
      tokIs(t.toks[s.start - 1], 'chào', 'với', 'cho', 'của', 'gọi', 'thương', 'yêu', 'nhớ', 'giúp', 'thăm')
    )
      continue
    const a = d.action as Action & { count: number }
    a.count = clampCount(s.m.nums[0] ?? 1, LIMITS.maxCount, notes)
    d.spans.push(s)
    take(s)
  }
  // clamp spins given in the phrase itself ("quay 9 vòng")
  for (const d of drafts) {
    if (d.action.type === 'turn') d.action.count = clampCount(d.action.count, LIMITS.maxSpins, notes)
  }
  // walking steps
  for (const s of free('STEPS')) {
    const d = nearestDraft(drafts, s, (x) => x.action.type === 'walk')
    if (!d || d.action.type !== 'walk') continue
    const m = matchOf(s, 'STEPS')
    const v = m.e.val
    const n = v?.k === 'steps' && v.n !== undefined ? v.n : (m.nums[0] ?? 3)
    d.action.steps = clampCount(n, LIMITS.maxSteps, notes)
    d.spans.push(s)
    take(s)
  }
  // durations for dance / run ("nhảy múa 30 giây")
  const durs = free('DURATION')
  if (durs.length > 0) {
    const d = nearestDraft(drafts, durs[0]!, (x) => x.action.type === 'dance' || x.action.type === 'run')
    if (d && (d.action.type === 'dance' || d.action.type === 'run')) {
      let secs = 0
      for (const s of durs) secs += durationOf(s)
      d.action.seconds = clampCount(secs, LIMITS.maxMotionSeconds, notes)
      d.spans.push(...durs)
      take(...durs)
    }
  }
  // directions: "quay trái", "đi sang phải", or a bare "phải" carried from the previous clause
  for (const s of [...free('LEFT'), ...free('RIGHT')].sort((a, b) => a.start - b.start)) {
    const dir = s.m.e.concept === 'RIGHT' || (!has(s, 'LEFT') && has(s, 'RIGHT')) ? 'right' : 'left'
    const d = nearestDraft(
      drafts,
      s,
      (x) =>
        !x.fixedDir &&
        ((x.action.type === 'walk' && x.action.direction === 'forward') ||
          (x.action.type === 'turn' && x.action.direction === 'around')),
    )
    if (d) {
      if (d.action.type === 'walk') d.action.direction = dir
      else if (d.action.type === 'turn') d.action.direction = dir
      d.fixedDir = true
      d.spans.push(s)
      take(s)
      continue
    }
    if (drafts.some((x) => x.action.type !== 'ack_negation')) continue
    take(s)
    if (carry.motion === 'walk') {
      drafts.push({
        action: { type: 'walk', direction: dir, steps: 3 },
        pos: s.start,
        spans: [s],
        source: 'carry',
        confMul: 0.85,
        fixedDir: true,
      })
    } else {
      drafts.push({
        action: { type: 'turn', direction: dir, count: 1 },
        pos: s.start,
        spans: [s],
        source: carry.motion === 'turn' ? 'carry' : 'rule',
        confMul: carry.motion === 'turn' ? 0.85 : 0.8,
        fixedDir: true,
      })
    }
  }
  // "quẹo phải ba bước": steps after a left / right turn walk that way
  for (const s of free('STEPS')) {
    const d = nearestDraft(
      drafts,
      s,
      (x) => x.action.type === 'turn' && (x.action.direction === 'left' || x.action.direction === 'right'),
    )
    if (!d || d.action.type !== 'turn' || (d.action.direction !== 'left' && d.action.direction !== 'right'))
      continue
    const m = matchOf(s, 'STEPS')
    const v = m.e.val
    const n = v?.k === 'steps' && v.n !== undefined ? v.n : (m.nums[0] ?? 3)
    d.action = { type: 'walk', direction: d.action.direction, steps: clampCount(n, LIMITS.maxSteps, notes) }
    d.spans.push(s)
    take(s)
  }
}
