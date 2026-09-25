import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpeaker, type SynthLike, type UtteranceLike, type WebSpeaker } from './tts'
import {
  estimateSpeechMs,
  normalizeLang,
  pickLocalVoice,
  pickVoice,
  rankVoices,
  splitForSpeech,
  type VoiceLike,
} from './voiceRank'

const V = (name: string, lang: string, localService = true): VoiceLike => ({ name, lang, localService })

const HOAIMY = V('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN', false)
const NAMMINH = V('Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'vi-VN', false)
const LINH = V('Linh', 'vi-VN')
const AN = V('Microsoft An - Vietnamese (Vietnam)', 'vi-VN')
const GOOGLE_VI = V('Google Tiếng Việt', 'vi_VN')
const SAMANTHA = V('Samantha', 'en-US')
const GOOGLE_US = V('Google US English', 'en-US', false)
const DANIEL = V('Daniel', 'en-GB')
const ZIRA = V('Microsoft Zira - English (United States)', 'en-US')

describe('voice ranking', () => {
  it('normalizes Android-style language tags', () => {
    expect(normalizeLang('vi_VN')).toBe('vi-vn')
    expect(normalizeLang(' EN-us ')).toBe('en-us')
  })

  it('ranks Vietnamese voices: HoaiMy, NamMinh, Linh, Google, An', () => {
    const ranked = rankVoices([SAMANTHA, AN, GOOGLE_VI, LINH, NAMMINH, HOAIMY], 'vi')
    expect(ranked.map((v) => v.name)).toEqual([HOAIMY, NAMMINH, LINH, GOOGLE_VI, AN].map((v) => v.name))
  })

  it('accepts vi_VN voices and any unnamed Vietnamese voice as a fallback', () => {
    expect(pickVoice([SAMANTHA, GOOGLE_VI], 'vi')).toBe(GOOGLE_VI)
    const other = V('Some Vietnamese Voice', 'vi')
    expect(pickVoice([SAMANTHA, other], 'vi')).toBe(other)
  })

  it('NEVER picks a non-Vietnamese voice for Vietnamese', () => {
    expect(pickVoice([SAMANTHA, GOOGLE_US, DANIEL, ZIRA], 'vi')).toBeNull()
    expect(pickVoice([], 'vi')).toBeNull()
  })

  it('ranks English voices: Samantha, Google US English, …, Zira; en-US before other English', () => {
    expect(pickVoice([DANIEL, ZIRA, GOOGLE_US, SAMANTHA], 'en')).toBe(SAMANTHA)
    expect(pickVoice([DANIEL, ZIRA, GOOGLE_US], 'en')).toBe(GOOGLE_US)
    expect(pickVoice([DANIEL, V('Fred', 'en-US')], 'en')?.name).toBe('Fred')
    expect(pickVoice([HOAIMY], 'en')).toBeNull()
  })

  it('finds the best on-device voice (retry after a network voice fails)', () => {
    expect(pickLocalVoice([HOAIMY, NAMMINH, LINH], 'vi')).toBe(LINH)
  })

  it('splits long text into ≤180-character sentence chunks', () => {
    const sentence = 'Mình là Ronaldo, robot ảo của nhóm nghiên cứu, rất vui được gặp bạn hôm nay. '
    const text = sentence.repeat(6).trim()
    const chunks = splitForSpeech(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(180)
    expect(chunks.join(' ')).toBe(text)
    expect(splitForSpeech('Xin chào!')).toEqual(['Xin chào!'])
    expect(splitForSpeech('   ')).toEqual([])
    const long = 'a'.repeat(50) + ' ' + 'b'.repeat(200)
    for (const c of splitForSpeech(long)) expect(c.length).toBeLessThanOrEqual(180)
  })

  it('estimates speaking time', () => {
    expect(estimateSpeechMs('x'.repeat(14), 1)).toBe(1000)
    expect(estimateSpeechMs('x'.repeat(14), 0.5)).toBe(2000)
  })
})

class FakeUtterance implements UtteranceLike {
  text: string
  lang = ''
  voice: unknown = null
  rate = 1
  pitch = 1
  volume = 1
  onstart: UtteranceLike['onstart'] = null
  onend: UtteranceLike['onend'] = null
  onerror: UtteranceLike['onerror'] = null
  constructor(text: string) {
    this.text = text
  }
}

class FakeSynth implements SynthLike {
  voices: VoiceLike[] = []
  spoken: FakeUtterance[] = []
  cancels = 0
  paused = false
  /** ms until an utterance ends; null = never (lost `end` event). */
  endAfter: number | null = 200
  failVoice: VoiceLike | null = null
  private listener: (() => void) | null = null
  private current: FakeUtterance | null = null

  getVoices(): VoiceLike[] {
    return this.voices
  }
  addEventListener(_t: 'voiceschanged', cb: () => void): void {
    this.listener = cb
  }
  removeEventListener(): void {
    this.listener = null
  }
  setVoices(v: VoiceLike[]): void {
    this.voices = v
    this.listener?.()
  }
  speak(u: UtteranceLike): void {
    const fu = u as FakeUtterance
    this.spoken.push(fu)
    if (!fu.text) return
    this.current = fu
    setTimeout(() => {
      if (this.current !== fu) return
      if (this.failVoice && fu.voice === this.failVoice) {
        this.current = null
        fu.onerror?.({ error: 'network' })
        return
      }
      fu.onstart?.({})
      if (this.endAfter !== null) {
        setTimeout(() => {
          if (this.current !== fu) return
          this.current = null
          fu.onend?.({})
        }, this.endAfter)
      }
    }, 10)
  }
  cancel(): void {
    this.cancels++
    const cur = this.current
    this.current = null
    cur?.onerror?.({ error: 'interrupted' })
  }
}

let synth: FakeSynth
let tts: WebSpeaker
let muted = false

function make() {
  tts = createSpeaker({
    synth,
    createUtterance: (t) => new FakeUtterance(t),
    isMuted: () => muted,
  })
  return tts
}

beforeEach(() => {
  vi.useFakeTimers()
  synth = new FakeSynth()
  muted = false
})
afterEach(() => {
  tts?.dispose()
  vi.useRealTimers()
})

describe('speaker', () => {
  it('reports loading, then missing when no Vietnamese voice ever appears', async () => {
    synth.voices = [SAMANTHA]
    make()
    expect(tts.status('vi')).toBe('loading')
    expect(tts.status('en')).toBe('ok')
    await vi.advanceTimersByTimeAsync(3_100)
    expect(tts.status('vi')).toBe('missing')
  })

  it('refuses to read Vietnamese with an English voice', async () => {
    synth.voices = [SAMANTHA, GOOGLE_US]
    make()
    const p = tts.speak('Xin chào bạn', 'vi')
    await vi.advanceTimersByTimeAsync(3_500)
    expect(await p).toBe('unavailable')
    expect(synth.spoken).toHaveLength(0)
  })

  it('picks up voices that load late (voiceschanged) and notifies', async () => {
    make()
    const cb = vi.fn()
    tts.onVoicesChanged(cb)
    const p = tts.speak('Xin chào', 'vi')
    await vi.advanceTimersByTimeAsync(500)
    synth.setVoices([SAMANTHA, LINH])
    expect(cb).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await p).toBe('ended')
    const u = synth.spoken[0]!
    expect(u.voice).toBe(LINH)
    expect(u.lang).toBe('vi-VN')
    expect(u.rate).toBe(0.9)
  })

  it('speaks English at rate 0.95 with an English voice and reports onStart', async () => {
    synth.voices = [LINH, SAMANTHA]
    make()
    const onStart = vi.fn()
    const p = tts.speak('Hello there', 'en', { onStart })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await p).toBe('ended')
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(synth.spoken[0]).toMatchObject({ lang: 'en-US', rate: 0.95, voice: SAMANTHA })
  })

  it('queues long text as several ≤180-character utterances', async () => {
    synth.voices = [LINH]
    make()
    const text = 'Mình là Ronaldo, robot ảo của nhóm nghiên cứu, rất vui được gặp bạn hôm nay. '.repeat(5)
    const p = tts.speak(text, 'vi')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await p).toBe('ended')
    expect(synth.spoken.length).toBeGreaterThan(1)
    for (const u of synth.spoken) expect(u.text.length).toBeLessThanOrEqual(180)
  })

  it('an aborted signal interrupts (and cancels the synth)', async () => {
    synth.voices = [LINH]
    synth.endAfter = 10_000
    make()
    const ac = new AbortController()
    const p = tts.speak('Một câu rất dài', 'vi', { signal: ac.signal })
    await vi.advanceTimersByTimeAsync(100)
    ac.abort()
    expect(await p).toBe('interrupted')
    expect(synth.cancels).toBeGreaterThan(0)
  })

  it('waits ~80 ms after a cancel before speaking again', async () => {
    synth.voices = [LINH]
    synth.endAfter = 10_000
    make()
    const first = tts.speak('Một câu dài', 'vi')
    await vi.advanceTimersByTimeAsync(100)
    tts.cancel()
    expect(await first).toBe('interrupted')
    synth.endAfter = 200
    const p = tts.speak('Chào', 'vi')
    await vi.advanceTimersByTimeAsync(50)
    expect(synth.spoken).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(40)
    expect(synth.spoken).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toBe('ended')
  })

  it('a lost end event is covered by the safety timeout', async () => {
    synth.voices = [LINH]
    synth.endAfter = null
    make()
    const p = tts.speak('Chào bạn', 'vi')
    await vi.advanceTimersByTimeAsync(2 * estimateSpeechMs('Chào bạn', 0.9) + 2_100)
    expect(await p).toBe('ended')
  })

  it('retries once with an on-device voice when a network voice fails', async () => {
    synth.voices = [HOAIMY, LINH]
    synth.failVoice = HOAIMY
    make()
    const p = tts.speak('Chào bạn', 'vi')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await p).toBe('ended')
    expect(synth.spoken.map((u) => u.voice)).toEqual([HOAIMY, LINH])
  })

  it('answers muted without speaking', async () => {
    synth.voices = [LINH]
    muted = true
    make()
    expect(await tts.speak('Chào', 'vi')).toBe('muted')
    expect(synth.spoken).toHaveLength(0)
  })

  it('prime() speaks one silent empty utterance, once', () => {
    make()
    tts.prime()
    tts.prime()
    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0]).toMatchObject({ text: '', volume: 0 })
  })

  it('is unsupported without speech synthesis', async () => {
    const none = createSpeaker(null)
    expect(none.supported).toBe(false)
    expect(none.status('vi')).toBe('unsupported')
    expect(await none.speak('x', 'vi')).toBe('unavailable')
  })
})
