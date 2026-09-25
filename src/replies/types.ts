import type { Lang } from '@/core/lang'
import type { ReplyKey, ReplyParams } from '@/core/replies'
import type { Fmt } from '@/i18n/format'

/** What a template may return: one string, variants (picked by seed), or text with its own TTS form. */
export type TemplateOut = string | readonly string[] | { text: string; speech: string }

export interface TemplateCtx {
  lang: Lang
  fmt: Fmt
  /** Non-negative integer; 0 when the ref has no seed (so the first variant is the default). */
  seed: number
  /** Deterministic variant pick. */
  pick<T>(variants: readonly T[]): T
}

/** One entry per ReplyKey: a missing key is a compile error. */
export type Templates = { [K in ReplyKey]: (p: ReplyParams[K], c: TemplateCtx) => TemplateOut }
