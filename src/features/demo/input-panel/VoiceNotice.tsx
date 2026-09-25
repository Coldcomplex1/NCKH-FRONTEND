import { VolumeX } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { Button, Disclosure } from '@/components/ui'
import type { Lang } from '@/core/lang'
import { useDict, useLang } from '@/i18n'
import { speaker } from '@/speech'
import { useDemo } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { demoDict } from '../dict'

/** Dismissed once per page session, per language. */
const dismissed = new Set<Lang>()

/**
 * One-time note when the device has no voice for the reply language: the speaker never reads
 * Vietnamese with an English voice, so the robot only shows text. Appears after the first command.
 */
export function VoiceNotice() {
  const lang = useLang()
  const t = useDict(demoDict).voiceNotice
  const muted = usePrefs((s) => s.muted)
  const hasTurns = useDemo((s) => s.turns.length > 0)
  const status = useSyncExternalStore(
    (cb) => speaker.onVoicesChanged(cb),
    () => speaker.status(lang),
    () => 'loading' as const,
  )
  const [, force] = useState(0)

  if (!speaker.supported || muted || !hasTurns || status !== 'missing' || dismissed.has(lang)) return null

  return (
    <div className="flex items-start gap-3 rounded-lg border-2 border-warning bg-sun-soft p-4 text-ink">
      <VolumeX aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{t.title(t.langNames[lang])}</p>
        <p className="mt-1 text-base">{t.body}</p>
        <Disclosure summary={t.how} className="mt-1">
          <ul className="list-disc space-y-1 pl-5 text-base">
            {t.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Disclosure>
        <Button
          className="mt-2"
          onClick={() => {
            dismissed.add(lang)
            force((n) => n + 1)
          }}
        >
          {t.dismiss}
        </Button>
      </div>
    </div>
  )
}
