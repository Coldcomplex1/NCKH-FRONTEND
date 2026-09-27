import { Keyboard, Mic } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui'
import { useDict } from '@/i18n'
import { cn } from '@/lib/cn'
import { demoDict } from '../dict'
import { panelId, tabId, type InputTab } from '../ids'

const TABS: InputTab[] = ['text', 'voice']

/**
 * [Văn bản | Giọng nói (Sắp có)] — WAI-ARIA tabs with roving tabindex and automatic activation
 * (←/→/Home/End). The voice tab stays selectable while disabled so people can see "coming soon"
 * (or "tạm nghỉ" while the ASR backend is offline).
 */
export function InputTabs({
  value,
  onChange,
  voiceSoon,
  voiceOffline = false,
}: {
  value: InputTab
  onChange(tab: InputTab): void
  voiceSoon: boolean
  voiceOffline?: boolean
}) {
  const t = useDict(demoDict).tabs
  const refs = useRef<Record<InputTab, HTMLButtonElement | null>>({ text: null, voice: null })

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(value)
    let next: InputTab | undefined
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length]
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length]
    else if (e.key === 'Home') next = TABS[0]
    else if (e.key === 'End') next = TABS[TABS.length - 1]
    if (!next) return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={t.label}
      className="grid grid-cols-2 gap-1 rounded-xl border-2 border-ink bg-surface p-1 shadow-pop"
    >
      {TABS.map((tab) => {
        const selected = tab === value
        const Icon = tab === 'text' ? Keyboard : Mic
        return (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-selected={selected}
            aria-controls={panelId(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={onKeyDown}
            className={cn(
              'inline-flex min-h-13 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg px-3 text-lg font-bold transition-colors duration-150',
              selected ? 'bg-primary text-on-primary' : 'text-ink hover:bg-surface-2',
            )}
          >
            <Icon aria-hidden="true" className="size-6 shrink-0" />
            <span>{tab === 'text' ? t.text : t.voice}</span>
            {tab === 'voice' && voiceSoon ? (
              <Badge tone="sun">{t.soon}</Badge>
            ) : tab === 'voice' && voiceOffline ? (
              <Badge tone="muted">{t.offline}</Badge>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
