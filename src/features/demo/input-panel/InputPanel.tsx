import { SpellCheck, WandSparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useDict } from '@/i18n'
import { ENV } from '@/lib/env'
import { useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'
import { ExampleChips } from './ExampleChips'
import { HistoryLog } from './HistoryLog'
import { COMMAND_INPUT_ID, panelId, tabId, type InputTab } from '../ids'
import { InputTabs } from './InputTabs'
import { TextComposer } from './TextComposer'
import { TranscriptCard } from './TranscriptCard'
import { VoiceNotice } from './VoiceNotice'

/** Recorder, waveform and upload UI: its own chunk, fetched the first time the Voice tab opens. */
const AudioTab = lazy(() => import('../audio-tab/AudioTab').then((m) => ({ default: m.AudioTab })))

/** Whether the audio tab is live (a real backend, or the dev-only mock). */
const AUDIO_LIVE = ENV.asr.enabled || ENV.asr.mock

/**
 * RIGHT column (flows with the page): tabs → composer + example chips (or the audio tab) →
 * voice notice → "what the robot heard" → history.
 */
export function InputPanel() {
  const [tab, setTab] = useState<InputTab>('text')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const aiOn = useDemo((s) => s.aiMoves === 'on')
  const correctOn = useDemo((s) => s.correction === 'on')
  const asr = useDemo((s) => s.asr)
  // Only a real backend can be offline; the dev mock is always "up".
  const backend = ENV.asr.enabled ? asr : 'ok'
  const t = useDict(demoDict)

  const switchToText = () => {
    setTab('text')
    // The text panel is re-shown in this render; focus once it is visible.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // The SkipLink (href="#command-input") must work even while the voice tab is shown.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target?.closest(`a[href="#${COMMAND_INPUT_ID}"]`)) return
      setTab('text')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="@container flex min-w-0 flex-col gap-5">
      <InputTabs
        value={tab}
        onChange={setTab}
        voiceSoon={!AUDIO_LIVE}
        voiceOffline={AUDIO_LIVE && backend === 'offline'}
      />

      {/* Kept mounted (hidden) so the SkipLink target #command-input always exists. */}
      <div
        role="tabpanel"
        id={panelId('text')}
        aria-labelledby={tabId('text')}
        hidden={tab !== 'text'}
        className="flex flex-col gap-6"
      >
        <div className="rounded-xl border-2 border-ink bg-surface p-4 shadow-pop sm:p-5">
          <TextComposer inputRef={inputRef} />
          {aiOn ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <WandSparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t.ai.disclosure}
            </p>
          ) : null}
          {correctOn ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted">
              <SpellCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t.ai.correctDisclosure}
            </p>
          ) : null}
        </div>
        <ExampleChips />
      </div>

      {/* The audio UI mounts only while its tab is shown (leaving the tab stops any recording). */}
      <div role="tabpanel" id={panelId('voice')} aria-labelledby={tabId('voice')} hidden={tab !== 'voice'}>
        {tab === 'voice' ? (
          <Suspense fallback={<div className="min-h-40" aria-busy="true" />}>
            <AudioTab live={AUDIO_LIVE} backend={backend} onSwitchToText={switchToText} />
          </Suspense>
        ) : null}
      </div>

      <VoiceNotice />
      <TranscriptCard />
      <HistoryLog />
    </div>
  )
}
