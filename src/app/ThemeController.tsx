import { useEffect } from 'react'
import { useLang } from '@/i18n'
import { shellDict } from '@/i18n/shell'
import { usePrefs } from '@/store/prefsStore'

/** Keeps <html data-theme>, <html lang>, <title> and the meta description in sync with preferences. */
export function ThemeController() {
  const theme = usePrefs((s) => s.theme)
  const lang = useLang()

  useEffect(() => {
    const root = document.documentElement
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!mql?.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    if (theme !== 'system' || !mql) return
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const t = shellDict[lang]
    document.documentElement.lang = lang
    document.title = t.docTitle
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.docDescription)
  }, [lang])

  return null
}
