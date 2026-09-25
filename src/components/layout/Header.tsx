import { Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SegmentedControl } from '@/components/ui'
import { useDict, useLang } from '@/i18n'
import { shellDict } from '@/i18n/shell'
import { cn } from '@/lib/cn'
import { speaker } from '@/speech'
import { usePrefs, type ThemePref } from '@/store/prefsStore'
import { project } from '@/content/project'

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const

export function Header() {
  const t = useDict(shellDict)
  const lang = useLang()
  const { theme, muted, setLang, setTheme, setMuted } = usePrefs()
  const active = useActiveSection(['demo', 'research'])
  const ThemeIcon = THEME_ICON[theme]

  return (
    <header className="sticky top-0 z-40 h-(--header-h) border-b-2 border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="mx-auto flex h-full max-w-[96rem] items-center gap-1.5 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <a
          href="#demo"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-md font-display font-extrabold"
        >
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-base text-on-primary">
            {project.team}
          </span>
          <span className="hidden truncate text-lg sm:inline">{t.siteName}</span>
        </a>

        <nav aria-label={t.nav.label} className="ml-auto flex items-center gap-1">
          {(['demo', 'research'] as const).map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'min-h-11 items-center rounded-full px-3 font-semibold hover:bg-surface-2',
                // Narrow phones: the page is one scroll, so drop "Demo" first, then "Research".
                id === 'demo' ? 'hidden sm:inline-flex' : 'hidden min-[25rem]:inline-flex',
                active === id && 'bg-primary-soft',
              )}
            >
              {t.nav[id]}
            </a>
          ))}
        </nav>

        <SegmentedControl
          label={t.lang.label}
          value={lang}
          onChange={setLang}
          size="sm"
          options={[
            { value: 'vi', label: 'VI', ariaLabel: shellDict.vi.lang.vi, lang: 'vi' },
            { value: 'en', label: 'EN', ariaLabel: shellDict.en.lang.en, lang: 'en' },
          ]}
        />

        <button
          type="button"
          onClick={() => setTheme(NEXT_THEME[theme])}
          aria-label={t.theme.next(t.theme[theme])}
          title={t.theme.next(t.theme[theme])}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border-2 border-line-strong bg-surface px-2.5 hover:bg-surface-2"
        >
          <ThemeIcon aria-hidden="true" className="size-5" />
          <span className="hidden xl:inline">{t.theme[theme]}</span>
        </button>

        <VoiceButton muted={muted} onToggle={() => setMuted(!muted)} labels={t.voice} />
      </div>
    </header>
  )
}

function VoiceButton({
  muted,
  onToggle,
  labels,
}: {
  muted: boolean
  onToggle(): void
  labels: (typeof shellDict)['vi']['voice']
}) {
  const supported = speaker.supported
  const on = supported && !muted
  const Icon = on ? Volume2 : VolumeX
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!supported}
      aria-pressed={on}
      aria-label={supported ? labels.toggle(on) : labels.unavailable}
      title={supported ? labels.toggle(on) : labels.unavailable}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border-2 border-line-strong bg-surface px-2.5 hover:bg-surface-2 disabled:opacity-50"
    >
      <Icon aria-hidden="true" className="size-5" />
      <span className="hidden lg:inline">{on ? labels.on : labels.off}</span>
    </button>
  )
}

/** Which of the given section ids is currently most in view. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])
  return active
}
