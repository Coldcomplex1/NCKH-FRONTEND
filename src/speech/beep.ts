/**
 * The timer alarm sound: three short WebAudio beeps (no audio file to download).
 * Browsers only let an AudioContext start after a user gesture, so it is created / resumed on the
 * first pointer or key press (and on every submit, via `primeBeep()`); a later alarm then plays
 * even though it fires from a timer.
 */

type AudioCtor = new () => AudioContext

let ctx: AudioContext | null = null
let unlockInstalled = false

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Create or resume the shared AudioContext. Call inside a user gesture. Never throws. */
export function primeBeep(): void {
  try {
    if (!ctx) {
      const Ctor = audioCtor()
      if (!Ctor) return
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  } catch {
    ctx = null
  }
}

/** Unlock audio on the first user gesture anywhere on the page (idempotent). */
export function installBeepUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const unlock = () => {
    primeBeep()
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export interface BeepOptions {
  count?: number
  /** Hz */
  frequency?: number
  /** Seconds per beep. */
  duration?: number
  /** Seconds of silence between beeps. */
  gap?: number
  /** 0–1 */
  volume?: number
}

/**
 * Three short beeps. Silently does nothing when audio is unavailable or still locked. Returns a
 * function that stops the beeps still to come (the alarm was dismissed).
 */
export function beep(opts: BeepOptions = {}): () => void {
  const { count = 3, frequency = 880, duration = 0.16, gap = 0.12, volume = 0.25 } = opts
  primeBeep()
  const ac = ctx
  if (!ac) return () => {}
  const oscs: OscillatorNode[] = []
  try {
    const t0 = ac.currentTime + 0.02
    for (let i = 0; i < count; i++) {
      const start = t0 + i * (duration + gap)
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, start)
      // Short attack/release envelope: no clicks.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015)
      gain.gain.setValueAtTime(volume, start + duration - 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(start + duration + 0.02)
      oscs.push(osc)
    }
  } catch {
    /* audio is best-effort */
  }
  return () => {
    for (const osc of oscs) {
      try {
        osc.stop()
        osc.disconnect()
      } catch {
        /* already stopped */
      }
    }
  }
}
