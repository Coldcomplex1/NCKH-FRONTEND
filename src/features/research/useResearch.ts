import { researchCopy } from '@/content/research'
import { stats } from '@/content/stats'
import { useDict, useFmt, useLang } from '@/i18n'

/** Everything a research section needs: its copy, the derived stats, the formatter and the UI language. */
export function useResearch() {
  const t = useDict(researchCopy)
  const f = useFmt()
  const lang = useLang()
  return { t, f, s: stats, lang }
}

/** Upper-case the first letter ("miền Trung" → "Miền Trung"). */
export function capFirst(x: string, lang: string): string {
  return x.charAt(0).toLocaleUpperCase(lang) + x.slice(1)
}
