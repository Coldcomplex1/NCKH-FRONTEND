import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ENV } from '@/lib/env'
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
      <InputTabs value={tab} onChange={setTab} voiceSoon={!AUDIO_LIVE} />

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
        </div>
        <ExampleChips />
      </div>

      {/* The audio UI mounts only while its tab is shown (leaving the tab stops any recording). */}
      <div role="tabpanel" id={panelId('voice')} aria-labelledby={tabId('voice')} hidden={tab !== 'voice'}>
        {tab === 'voice' ? (
          <Suspense fallback={<div className="min-h-40" aria-busy="true" />}>
            <AudioTab live={AUDIO_LIVE} onSwitchToText={switchToText} />
          </Suspense>
        ) : null}
      </div>

      <VoiceNotice />
      <TranscriptCard />
      <HistoryLog />
    </div>
  )
}
