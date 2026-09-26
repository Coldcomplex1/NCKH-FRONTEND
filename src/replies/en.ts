/** English reply templates: friendly, short, no emoji. Commands stay Vietnamese, so examples are quoted in Vietnamese. */
import type { MathToken } from '@/core/actions'
import { LIGHT_COLORS } from '@/core/colors'
import { describeWeatherCode } from '@/core/wmo'
import { project } from '@/content/project'
import { ENV } from '@/lib/env'
import type { Fmt } from '@/i18n/format'
import { ZODIAC } from '@/lib/calendar/lunar'
import { partOfDay, vnParts } from '@/lib/vnTime'
import {
  calDate,
  lunarDayFacts,
  lunarYearFacts,
  nextLunarDay,
  nextLunarDayOfMonth,
  tetFacts,
  type CalDate,
} from './calendar'
import { jokeAt } from './jokes'
import { ACTION_VERB, chainPhrase } from './phrases'
import { COLD_C, HOT_C, capFirst, forecastDay, isRainCode, rainLevel, safeList, safePhrase } from './shared'
import type { Templates } from './types'

const BOT = project.botName
const TEAM = project.team

export const WEEKDAY_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
const MONTH_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const DAY_PREFIX: Record<number, string> = {
  [-1]: 'Yesterday',
  0: 'Today',
  1: 'Tomorrow',
  2: 'The day after tomorrow',
}
const dayPrefix = (offset: number) => DAY_PREFIX[offset] ?? 'Today'
const isWas = (offset: number) => (offset < 0 ? 'was' : 'is')

/** "Saturday, February 6, 2027" */
function solarDate(d: CalDate): string {
  return `${WEEKDAY_EN[d.weekday]}, ${MONTH_EN[d.month - 1]} ${d.day}, ${d.year}`
}

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** "the 8th lunar month", "the leap 6th lunar month" */
function lunarMonth(month: number, leap: boolean): string {
  return `the ${leap ? 'leap ' : ''}${ordinal(month)} lunar month`
}

/** Festival names that end in "Festival" take "the". */
function festName(name: string): string {
  return /Festival$/.test(name) ? `the ${name}` : name
}

export function enTime(h: number, m: number): string {
  const h12 = h % 12 || 12
  return `It's ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}.`
}

function num(fmt: Fmt, n: number): string {
  return n < 0 ? `negative ${fmt.numFlex(-n)}` : fmt.numFlex(n)
}

const deg = (fmt: Fmt, n: number) => fmt.int(Math.round(n))

const OP: Record<string, string> = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' }
function exprWords(fmt: Fmt, expr: MathToken[]): string {
  return expr.map((t) => (typeof t === 'number' ? num(fmt, t) : (OP[t] ?? t))).join(' ')
}

const unit = (fmt: Fmt, n: number, word: string) => `${fmt.int(n)} ${word}${n === 1 ? '' : 's'}`

/** 90 → "1 minute 30 seconds". */
export function durationEn(fmt: Fmt, seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const parts: string[] = []
  if (h > 0) parts.push(unit(fmt, h, 'hour'))
  if (m > 0) parts.push(unit(fmt, m, 'minute'))
  if (r > 0 || parts.length === 0) parts.push(unit(fmt, r, 'second'))
  return parts.join(' ')
}

/** "a, b, then c" */
function thenList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')}, then ${items[items.length - 1]}`
}

/** "a, b or c" */
function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

const q = (s: string) => `“${s}”`

export const en: Templates = {
  // ---- motion
  'motion.jump': ({ count }, c) =>
    count > 1 ? `Jumping ${c.fmt.int(count)} times!` : c.pick(['Hup! Jumping!', 'Here I go, jumping!']),
  'motion.dance': (_, c) => c.pick(["Music on, let's dance!", 'Time to show you my moves!']),
  'motion.wave': ({ count }, c) => (count > 1 ? `Waving ${c.fmt.int(count)} times!` : 'Waving hello!'),
  'motion.nod': ({ count }, c) => (count > 1 ? `Nodding ${c.fmt.int(count)} times.` : 'Nod, nod!'),
  'motion.shake_head': ({ count }, c) =>
    count > 1 ? `Shaking my head ${c.fmt.int(count)} times.` : 'Shaking my head!',
  'motion.thumbs_up': ({ count }, c) => (count > 1 ? `Thumbs up, ${c.fmt.int(count)} times!` : 'Thumbs up!'),
  'motion.punch': ({ count }, c) =>
    count > 1 ? `Pow! ${c.fmt.int(count)} super punches!` : 'Pow! Super punch!',
  'motion.walk': ({ direction, steps }, c) => {
    const n = c.fmt.int(steps)
    switch (direction) {
      case 'forward':
        return steps > 1 ? `Walking ${n} steps forward.` : 'One step forward.'
      case 'backward':
        return steps > 1 ? `Stepping back ${n} steps.` : 'One step back.'
      case 'left':
        return steps > 1 ? `Walking ${n} steps to the left.` : 'One step to the left.'
      case 'right':
        return steps > 1 ? `Walking ${n} steps to the right.` : 'One step to the right.'
      case 'to_user':
        return 'Coming over to you!'
      case 'home':
        return 'Going back to my spot.'
    }
    return 'Walking.'
  },
  'motion.walk_blocked': () => "Oops, I've reached the wall, so I'll stop here.",
  'motion.run': (_, c) => c.pick(["Let's run!", 'Off I go, running!']),
  'motion.turn': ({ direction, count }, c) => {
    switch (direction) {
      case 'left':
        return 'Turning left.'
      case 'right':
        return 'Turning right.'
      case 'around':
        return 'Turning around.'
      case 'spin':
        return count > 1 ? `Spinning ${c.fmt.int(count)} times!` : 'Spinning around!'
    }
    return 'Turning.'
  },
  'motion.sit': () => 'Sitting down for a bit.',
  'motion.already_sitting': () => "I'm already sitting!",
  'motion.stand': () => "I'm up!",
  'motion.already_standing': () => "I'm already standing!",
  'motion.sleep': () => ({ text: 'Good night… zzz.', speech: 'Good night.' }),
  'motion.already_sleeping': () => ({ text: "I'm already asleep… zzz.", speech: "I'm already asleep." }),
  'motion.wake': () => "I'm awake!",
  'motion.already_awake': () => "I'm already awake!",
  'motion.fall': () => 'Whoa, I fell…',
  'motion.fall_recover': () => "Just kidding, I'm fine!",
  'motion.emote': ({ emotion }) =>
    ({
      happy: "I'm so happy!",
      sad: "I'm so sad…",
      angry: "Hmph, I'm angry!",
      surprised: 'Wow, what a surprise!',
    })[emotion],
  'motion.stop': () => 'Stopped.',
  'motion.chain': ({ actions }, c) => {
    const parts = actions.map((a) => chainPhrase(a, 'en', c.fmt))
    if (parts.length === 0) return 'Okay!'
    return `Okay! ${capFirst(thenList(parts))}.`
  },
  'motion.custom_move': ({ name, count }, c) => {
    const n = safePhrase(name?.en)
    if (!n)
      return count > 1 ? `Watch this, ${c.fmt.int(count)} times!` : c.pick(['Watch this!', 'Okay, watch me!'])
    return count > 1 ? `Watch this: ${n}, ${c.fmt.int(count)} times!` : `Watch this: ${n}!`
  },

  // ---- AI moves
  'ai.thinking': (_, c) => c.pick(['Let me work out that move…', 'Hmm, let me figure that one out…']),
  'ai.move_failed': () => "Sorry, I couldn't work out that move. Please try again later!",

  // ---- information
  'info.time': ({ iso }) => {
    const p = vnParts(new Date(iso))
    return enTime(p.hour, p.minute)
  },
  'info.date': ({ iso, dayOffset }) =>
    `${dayPrefix(dayOffset)} ${isWas(dayOffset)} ${solarDate(calDate(iso, dayOffset))}.`,
  'info.weekday': ({ iso, dayOffset }) =>
    `${dayPrefix(dayOffset)} ${isWas(dayOffset)} ${WEEKDAY_EN[calDate(iso, dayOffset).weekday]}.`,
  'info.lunar': ({ iso, query, dayOffset, yearOffset, month: askedMonth }) => {
    switch (query) {
      case 'date': {
        const f = lunarDayFacts(iso, dayOffset)
        const l = f.lunar
        const animal = ZODIAC.en[f.zodiac]
        let s = `${dayPrefix(dayOffset)} ${isWas(dayOffset)} day ${l.day} of ${lunarMonth(l.month, l.leap)}, in the year of ${f.canChi} (the ${animal}).`
        if (f.festival) s += ` That's ${festName(f.festival.name.en)}!`
        else if (f.festivalNext) {
          const next =
            dayOffset === -1
              ? 'Today'
              : dayOffset === 0
                ? 'Tomorrow'
                : dayOffset === 1
                  ? 'The day after'
                  : 'The next day'
          s += ` ${next} is ${festName(f.festivalNext.name.en)}!`
        }
        return s
      }
      case 'year': {
        if (yearOffset) {
          const y = lunarYearFacts(iso, yearOffset)
          return yearOffset > 0
            ? `Next lunar year is ${y.canChi}, the year of the ${ZODIAC.en[y.zodiac]}.`
            : `Last lunar year was ${y.canChi}, the year of the ${ZODIAC.en[y.zodiac]}.`
        }
        const f = lunarDayFacts(iso, 0)
        const animal = ZODIAC.en[f.zodiac]
        return f.lunarYearLags
          ? `By the lunar calendar, it's still the year of ${f.canChi}, the year of the ${animal}.`
          : `This lunar year is ${f.canChi}, the year of the ${animal}.`
      }
      case 'tet': {
        const t = tetFacts(iso)
        if (t.kind === 'during') return `Today is day ${t.day} of Tết. Happy Lunar New Year!`
        const animal = ZODIAC.en[t.zodiac]
        if (t.days === 1)
          return `Tết ${t.canChi}, the year of the ${animal}, is tomorrow: ${solarDate(t.solar)}!`
        return `There are ${t.days} days until Tết, the Lunar New Year of ${t.canChi} (the ${animal}). It falls on ${solarDate(t.solar)}.`
      }
      case 'ram':
      case 'mung1': {
        const f =
          askedMonth !== undefined
            ? nextLunarDayOfMonth(iso, query === 'ram' ? 15 : 1, askedMonth)
            : nextLunarDay(iso, query === 'ram' ? 15 : 1)
        const month = lunarMonth(f.lunar.month, f.lunar.leap)
        const name = query === 'ram' ? `the full moon day (15th) of ${month}` : `the 1st day of ${month}`
        const fest = f.festival ? ` That's also ${festName(f.festival.name.en)}.` : ''
        if (f.days === 0) return `Today is ${name}!${fest}`
        const when = f.days === 1 ? "that's tomorrow" : `in ${f.days} days`
        return `${capFirst(name)} falls on ${solarDate(f.solar)}, ${when}.${fest}`
      }
    }
    return "Sorry, I can't check the lunar calendar right now."
  },
  'info.weather': ({ place, dayOffset, aspect, data }, c) => {
    const f = c.fmt
    const where = place.en
    const cur = data.current
    const day = forecastDay(data, dayOffset)
    const today = dayOffset === 0
    const hot = (t: number) => (t >= HOT_C ? " It's very hot, so drink plenty of water!" : '')
    const cold = (t: number) => (t <= COLD_C ? " It's chilly, so dress warmly!" : '')
    const lower = dayPrefix(dayOffset).toLowerCase()
    if (!today && !day) return `Sorry, I don't have a forecast for ${lower} in ${where} yet.`

    if (aspect === 'rain') {
      if (today && isRainCode(cur.code)) {
        return `Right now in ${where}: ${describeWeatherCode(cur.code).text.en}. Don't forget your umbrella!`
      }
      const prefix = `${dayPrefix(dayOffset)} in ${where}`
      const p = day?.precipProbability ?? null
      if (p === null) {
        const code = day?.code ?? cur.code
        return isRainCode(code)
          ? `${prefix}: ${describeWeatherCode(code).text.en}. Don't forget your umbrella!`
          : `${prefix}: ${describeWeatherCode(code).text.en}, probably no rain.`
      }
      const pct = `${f.int(p)}%`
      switch (rainLevel(p)) {
        case 'likely':
          return `${prefix}, rain is likely (${pct}). Don't forget your umbrella!`
        case 'possible':
          return `${prefix}, rain is possible (${pct}). Better bring an umbrella.`
        case 'unlikely':
          return `${prefix}, rain is unlikely (${pct}).`
      }
    }

    if (aspect === 'temp') {
      if (today) {
        const extra = hot(cur.tempC) || cold(cur.tempC)
        return `In ${where} it's ${deg(f, cur.tempC)}°C right now, and it feels like ${deg(f, cur.feelsLikeC)}°C.${extra}`
      }
      const d = day!
      const extra = hot(d.maxC) || cold(d.minC)
      return `${dayPrefix(dayOffset)} in ${where}: from ${deg(f, d.minC)} to ${deg(f, d.maxC)}°C.${extra}`
    }

    // general
    if (today) {
      const desc = describeWeatherCode(cur.code).text.en
      const p = day?.precipProbability ?? null
      const rain =
        p !== null && p >= 60 && !isRainCode(cur.code) ? ' Rain is likely today, so bring an umbrella!' : ''
      const umbrella = isRainCode(cur.code) ? " Don't forget your umbrella!" : ''
      const extra = hot(cur.tempC) || cold(cur.tempC)
      return `Right now in ${where}: ${desc}, ${deg(f, cur.tempC)}°C, humidity ${f.int(cur.humidity)}%, wind ${f.int(cur.windKmh)} km/h.${rain}${umbrella}${extra}`
    }
    const d = day!
    const desc = describeWeatherCode(d.code).text.en
    const p = d.precipProbability
    const chance = p === null ? '' : `, ${f.int(p)}% chance of rain`
    const rain = p !== null && p >= 60 ? " Don't forget your umbrella!" : ''
    const extra = hot(d.maxC) || cold(d.minC)
    return `${dayPrefix(dayOffset)} in ${where}: ${desc}, ${deg(f, d.minC)} to ${deg(f, d.maxC)}°C${chance}.${rain}${extra}`
  },
  'info.weather_error': ({ place, reason }) => {
    const why = {
      offline: 'because the device is offline',
      timeout: 'because the network is too slow',
      http: 'because the weather service is having trouble',
    }[reason]
    return `Sorry, I couldn't get the weather for ${place.en} ${why}. Please try again later.`
  },
  'info.weather_unknown_place': ({ place }) =>
    `I don't know that place yet, so here's the weather for ${place.en}.`,
  'info.math': ({ expr, result }, c) => {
    const approx = Math.abs(result * 1e4 - Math.round(result * 1e4)) > 1e-6
    return `${capFirst(exprWords(c.fmt, expr))} ${approx ? 'is about' : 'equals'} ${num(c.fmt, result)}.`
  },
  'info.math_error': ({ error }) =>
    error === 'div0' ? "Oops, you can't divide by zero!" : 'That number is too big for me!',

  // ---- timers
  'timer.start': ({ seconds, label }, c) => {
    const dur = durationEn(c.fmt, seconds)
    const l = safePhrase(label)
    return l
      ? `Okay, I'll remind you about ${q(l)} in ${dur}!`
      : `Timer set for ${dur}. I'll let you know when time's up!`
  },
  'timer.done': ({ label }) => {
    const l = safePhrase(label)
    return l ? `Ring ring! It's time for ${q(l)}!` : "Ring ring! Time's up!"
  },
  'timer.cancel': ({ label }) => {
    const l = safePhrase(label)
    return l ? `Okay, I cancelled the ${q(l)} reminder.` : 'Timer cancelled.'
  },
  'timer.none': ({ label }) => {
    const l = safePhrase(label)
    return l ? `There's no ${q(l)} reminder running right now.` : "There's no timer running right now."
  },
  // (engine) the alarm of a ringing timer was dismissed
  'timer.dismissed': () => 'Alarm stopped.',
  'timer.status': ({ remainingSec, label }, c) => {
    const l = safePhrase(label)
    if (remainingSec < 1) return 'Almost time!'
    const dur = durationEn(c.fmt, Math.ceil(remainingSec))
    return l ? `${dur} left until ${q(l)}.` : `${capFirst(dur)} left.`
  },
  'timer.limit': ({ max }, c) => `I can only keep ${c.fmt.int(max)} timers at once. Please cancel one first.`,
  // The examples are Vietnamese commands: shown in the bubble, left out of the English speech.
  'timer.ask': ({ label }) => ({
    text: `When should I remind you? For example: ${q(`nhắc tôi ${safePhrase(label) ?? 'uống thuốc'} sau 15 phút`)}.`,
    speech: 'When should I remind you? Try one of the suggested commands.',
  }),
  'timer.clock_time': () => ({
    text: `I can't set reminders for a clock time yet. Please say ${q('sau 30 phút')} (in 30 minutes) instead.`,
    speech: "I can't set reminders for a clock time yet. Please tell me how many minutes from now instead.",
  }),

  // ---- conversation
  'chat.greet': ({ iso }, c) => {
    const hello = {
      morning: 'Good morning!',
      noon: 'Hello!',
      afternoon: 'Good afternoon!',
      evening: 'Good evening!',
      night: "Hi there, it's getting late!",
    }[partOfDay(vnParts(new Date(iso)).hour)]
    return c.pick([
      `${hello} I'm ${BOT}. What can I do for you?`,
      `${hello} Nice to see you. How can I help?`,
    ])
  },
  'chat.thanks': (_, c) =>
    c.pick(["You're welcome! Happy to help.", 'Anytime! Just ask if you need anything.']),
  'chat.goodbye': (_, c) => c.pick(['Goodbye, see you soon!', 'Bye! Have a lovely day!']),
  'chat.praise': (_, c) =>
    c.pick(['Thank you so much! That makes me happy.', "Aww, you're making me blush. Thank you!"]),
  'chat.insult': () => "Sorry! I'll try harder, please don't be upset.",
  'chat.intro': ({ topic, wer }, c) => {
    switch (topic) {
      case 'who':
        return `I'm ${BOT}, the ${TEAM} research team's robot assistant. I understand commands in Vietnamese from all three regions!`
      case 'creator':
        return `I was built by a team of ${TEAM} students, mentored by ${project.mentor.name.en}.`
      case 'age':
        return "I'm still very young, brand new in fact!"
      case 'project': {
        const werPart =
          wer !== undefined && Number.isFinite(wer)
            ? `, with a word error rate (WER) of about ${c.fmt.pct(wer, 1)} on the test set`
            : ''
        return ENV.asr.enabled
          ? `I hear your voice using PhoWhisper-large fine-tuned on the ViMD dataset${werPart}. You can also type to me.`
          : `Right now I read the commands you type. Soon I'll be able to hear your voice, using PhoWhisper-large fine-tuned on the ViMD dataset${werPart}.`
      }
    }
    return `I'm ${BOT}.`
  },
  'chat.capabilities': () => {
    const list =
      'I can jump, dance, wave, walk around, tell the time and the lunar date, set timers, check the weather, do math, tell jokes, and switch the light and the fan in my room.'
    return {
      text: `${list} Try typing “nhảy ba lần” (jump three times)!`,
      speech: `${list} Try one of the example commands!`,
    }
  },
  'chat.joke': ({ index }) => jokeAt(index).en,
  'chat.smalltalk': ({ topic }) =>
    ({
      how_are_you: "I'm great, thanks! How about you?",
      love: 'Aww, I like you too!',
      user_sad: "Don't be sad. Want to hear a joke?",
      user_tired: 'Take a little rest and have some water!',
      user_happy: "If you're happy, I'm happy too!",
    })[topic],
  'chat.emergency': () => ({
    text: "I'm only a demo robot and can't call for help. If this is an emergency, please call 115 or a family member right away.",
    speech:
      "I'm only a demo robot and can't call for help. If this is an emergency, please call one one five or a family member right away.",
  }),
  'pref.voice': ({ on }) =>
    on ? 'I can talk again!' : "Okay, I'll stay quiet. You can still read my replies.",
  'pref.language': ({ lang }) =>
    lang === 'en'
      ? "Okay, I'll reply in English now! Commands are still in Vietnamese."
      : "Okay, I'll speak Vietnamese now!",

  // ---- smart home
  'home.light_on': ({ color }) =>
    color ? `The light is on, in ${LIGHT_COLORS[color].name.en}!` : 'The light is on!',
  'home.light_off': () => 'The light is off.',
  'home.light_color': ({ color }) => `The light is now ${LIGHT_COLORS[color].name.en}.`,
  'home.light_already': ({ on }) => (on ? 'The light is already on!' : 'The light is already off.'),
  'home.xanh_ambiguous': () => ({
    text: "I've set it to teal for now. Did you mean green (xanh lá) or blue (xanh dương)?",
    speech: "I've set it to teal for now. Did you mean green or blue?",
  }),
  'home.black_is_off': () => 'A black light is… just “off”!',
  'home.fan_on': ({ speed }) => `Fan on, speed ${speed}.`,
  'home.fan_off': () => 'The fan is off.',
  'home.fan_speed': ({ speed, delta }) =>
    delta === 1
      ? `Stronger! Now at speed ${speed}.`
      : delta === -1
        ? `Gentler, now at speed ${speed}.`
        : `Fan set to speed ${speed}.`,
  'home.fan_already': ({ on }) => (on ? 'The fan is already running!' : 'The fan is already off.'),
  'home.fan_speed_limit': ({ speed }) =>
    speed >= 3
      ? `The fan is already at its strongest, speed ${speed}!`
      : speed <= 1
        ? `The fan is already at its gentlest, speed ${speed}!`
        : `The fan is at speed ${speed}.`,
  'home.later': ({ device, power }) => ({
    text: `I can't schedule the light or the fan yet. When you need it, just say ${q(`${power === 'off' ? 'tắt' : 'bật'} ${device === 'fan' ? 'quạt' : 'đèn'}`)}.`,
    speech: "I can't schedule the light or the fan yet. Just ask me again when you need it.",
  }),

  // ---- meta
  unsupported: ({ reason, verb, object, alternative }) => {
    const what = object ? `${verb.en} ${object.en}` : verb.en
    const alt = alternative ? ` But I can ${ACTION_VERB.en[alternative]}!` : ''
    switch (reason) {
      case 'physical':
        return `Sorry, I'm a robot, so I can't ${what}.${alt}`
      case 'device_absent':
        return `Sorry, my room doesn't have ${object ? object.en : 'that device'}, so I can't do that.${alt}`
      case 'out_of_scope':
        return `Sorry, I don't know how to ${what} yet.${alt}`
      case 'unsafe':
        return `Sorry, that isn't safe, so I won't do it.${alt}`
    }
    return `Sorry, I can't do that yet.${alt}`
  },
  negation: ({ target, emotion }) =>
    emotion
      ? `Okay, ${{ happy: "I'll stop laughing", sad: "I won't be sad", angry: "I'm not angry", surprised: "I won't act surprised" }[emotion]}.`
      : `Okay, I won't ${ACTION_VERB.en[target]}.`,
  unknown: ({ suggestions }, c) => {
    const s = safeList(suggestions, 3).map(q)
    const sorry = c.pick(["Sorry, I didn't understand that.", "Hmm, I didn't catch that."])
    if (s.length === 0) return `${sorry} Could you say it another way?`
    // The suggestions are Vietnamese: show them, but an English voice would mangle them.
    return {
      text: `${sorry} Try saying ${orList(s)}.`,
      speech: `${sorry} Try one of the suggested commands.`,
    }
  },
  partial_unknown: () => "I didn't understand part of that. Could you say that part again?",
  'note.capped': ({ max, caps }, c) => {
    // (engine) one phrase per capped action, in its own unit: times / steps / spins / seconds
    const n = (x: number) => c.fmt.int(x)
    if (!caps || caps.length === 0) return `I'll do it ${n(max)} times at most.`
    const parts = caps.map((cap) => {
      switch (cap.unit) {
        case 'steps':
          return `walk ${n(cap.max)} steps`
        case 'spins':
          return `do ${n(cap.max)} spins`
        case 'seconds':
          return `${cap.action === 'run' ? 'run' : 'dance'} for ${n(cap.max)} seconds`
        case 'times':
          return `${ACTION_VERB.en[cap.action]} ${n(cap.max)} times`
      }
      return `do it ${n(cap.max)} times`
    })
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
    return `I'll ${list} at most.`
  },
  'note.nothing_to_repeat': () => "There's nothing to repeat yet. Try asking me to jump!",
  'note.too_many_actions': ({ max }, c) =>
    `I can only do ${c.fmt.int(max)} things at a time. Tell me the rest afterwards.`,
  welcome: ({ layout }) => {
    const where = layout === 'side' ? 'on the right' : 'below'
    return {
      text: `Hi, I'm ${BOT}! Type a command in Vietnamese in the box ${where}, for example “nhảy lên” (jump).`,
      speech: `Hi, I'm ${BOT}! Type a command in Vietnamese in the box ${where}.`,
    }
  },
  'robot.not_ready': () => "I'm still starting up. Please wait a moment.",
  'asr.empty': () => "I didn't hear anything. Please speak a little louder and clearer.",
  'asr.error': ({ kind }) =>
    ({
      network: "Sorry, I couldn't reach the speech recognizer. Please check your connection and try again.",
      timeout: 'Sorry, the speech recognizer took too long. Please try again.',
      too_large: 'Sorry, that recording is too long. Please try a shorter one.',
      unsupported_media: "Sorry, I can't read that file format. Please try a WAV or MP3 file.",
      unprocessable: "Sorry, I couldn't process that audio. Please record it again.",
      busy: 'Sorry, the speech recognizer is busy. Please wait a moment and try again.',
      http: 'Sorry, the speech recognizer is having trouble. Please try again later.',
      bad_response: 'Sorry, I got a strange answer from the speech recognizer. Please try again.',
    })[kind],
  'error.generic': () => 'Sorry, something went wrong. Please try again.',
}
