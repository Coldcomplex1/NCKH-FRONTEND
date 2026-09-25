import { useMemo } from 'react'
import type { Lang } from '@/core/lang'
import { usePrefs } from '@/store/prefsStore'
import { makeFmt, type Fmt } from './format'

export type { Fmt } from './format'
export { makeFmt } from './format'

/** Current UI language. */
export function useLang(): Lang {
  return usePrefs((s) => s.lang)
}

/**
 * Per-feature dictionaries: each feature keeps its own `{ vi, en }` object next to its code and
 * reads it with `useDict(dict)`. Declare `en` with the type of `vi` so missing keys fail to compile:
 *
 *   const vi = { title: 'Xin chào', count: (n: number): string => `${n} lần` }  // annotate `: string`!
 *   const en: typeof vi = { title: 'Hello', count: (n) => `${n} times` }
 *   export const demoDict = { vi, en }
 */
export function useDict<T>(dict: { vi: T; en: T }): T {
  const lang = useLang()
  return dict[lang]
}

export function useFmt(): Fmt {
  const lang = useLang()
  return useMemo(() => makeFmt(lang), [lang])
}

/** Pick the string for a language from a Bilingual value. */
export function tr(b: { vi: string; en: string }, lang: Lang): string {
  return b[lang]
}
