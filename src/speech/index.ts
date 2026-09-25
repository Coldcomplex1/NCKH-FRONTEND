import type { Speaker } from '@/core/speech'
import { getPrefs, usePrefs } from '@/store/prefsStore'
import { installBeepUnlock, primeBeep } from './beep'
import { browserSpeechEnv, createSpeaker, type WebSpeaker } from './tts'

export { beep, primeBeep } from './beep'
export { createSpeaker, createNullSpeaker } from './tts'
export type { SpeechEnv, WebSpeaker } from './tts'
export { normalizeLang, pickVoice, rankVoices } from './voiceRank'

const tts: WebSpeaker = createSpeaker(browserSpeechEnv(() => getPrefs().muted))

/**
 * The app's one text-to-speech voice. Only the robot engine calls `speak()`; the UI calls
 * `prime()` synchronously inside the submit gesture (which also unlocks the alarm beep) and reads
 * `status(lang)` for the "no Vietnamese voice on this device" notice.
 */
export const speaker: Speaker = {
  supported: tts.supported,
  prime() {
    tts.prime()
    primeBeep()
  },
  status: (lang) => tts.status(lang),
  onVoicesChanged: (cb) => tts.onVoicesChanged(cb),
  speak: (text, lang, opts) => tts.speak(text, lang, opts),
  cancel: () => tts.cancel(),
}

if (typeof window !== 'undefined') {
  installBeepUnlock()
  // Muting stops the current sentence immediately; leaving the page stops it too.
  const unsubscribe = usePrefs.subscribe((s, prev) => {
    if (s.muted && !prev.muted) tts.cancel()
  })
  const onHide = () => tts.cancel()
  window.addEventListener('pagehide', onHide)
  import.meta.hot?.dispose(() => {
    unsubscribe()
    window.removeEventListener('pagehide', onHide)
    tts.dispose()
  })
}
