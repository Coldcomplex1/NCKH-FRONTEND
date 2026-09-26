/**
 * Reply renderer: turns a stored ReplyRef into bubble text + TTS text in the UI language.
 * Pure (no store, no clock reads besides the ISO strings inside the params), so toggling VI/EN
 * simply re-renders past bubbles and history.
 */
import type { Lang } from '@/core/lang'
import type { RenderedReply, ReplyKey, ReplyParams, ReplyRef, ReplyTone } from '@/core/replies'
import { makeFmt } from '@/i18n/format'
import { en } from './en'
import { normSeed, pickBySeed, toSpeech } from './shared'
import type { TemplateCtx, TemplateOut, Templates } from './types'
import { vi } from './vi'

export { JOKES } from './jokes'

const TEMPLATES: Record<Lang, Templates> = { vi, en }

const TONES: Partial<Record<ReplyKey, ReplyTone>> = {
  unsupported: 'sorry',
  'chat.insult': 'sorry',
  'info.weather_error': 'sorry',
  'info.math_error': 'sorry',
  'asr.error': 'sorry',
  'error.generic': 'sorry',
  'robot.not_ready': 'sorry',
  'timer.limit': 'sorry',
  'timer.done': 'alert',
  unknown: 'question',
  'home.xanh_ambiguous': 'question',
  'timer.ask': 'question',
  'timer.clock_time': 'question',
  'home.later': 'sorry',
  'ai.move_failed': 'sorry',
  'chat.emergency': 'alert',
}

export function replyTone(key: ReplyKey): ReplyTone {
  return TONES[key] ?? 'normal'
}

function run<K extends ReplyKey>(t: Templates, key: K, params: ReplyParams[K], c: TemplateCtx): TemplateOut {
  return t[key](params, c)
}

function finish(out: TemplateOut, c: TemplateCtx): { text: string; speech: string } {
  if (typeof out === 'string') return { text: out, speech: toSpeech(out, c.lang) }
  if ('text' in out) return { text: out.text, speech: toSpeech(out.speech, c.lang) }
  const text = c.pick(out as readonly string[])
  return { text, speech: toSpeech(text, c.lang) }
}

/** Pure: renders a reply reference in the given language. Never throws. */
export function renderReply(ref: ReplyRef, lang: Lang): RenderedReply {
  const seed = normSeed(ref.seed)
  const c: TemplateCtx = {
    lang,
    fmt: makeFmt(lang),
    seed,
    pick: (variants) => pickBySeed(variants, seed),
  }
  const tone = replyTone(ref.key)
  try {
    const out = finish(run(TEMPLATES[lang], ref.key, ref.params as ReplyParams[typeof ref.key], c), c)
    if (out.text.trim()) return { ...out, tone }
  } catch {
    // Malformed params (e.g. a stale ref from an older build): fall through to the generic reply.
  }
  const fallback = finish(run(TEMPLATES[lang], 'error.generic', {}, c), c)
  return { ...fallback, tone: 'sorry' }
}
