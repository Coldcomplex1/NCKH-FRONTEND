import { encodeWavPcm16 } from './wav'

/** Sample rate the ASR model was trained on. */
export const ASR_SAMPLE_RATE = 16_000

/** Audio ready to upload. */
export interface PreparedAudio {
  blob: Blob
  /** Multipart filename (undefined = let the ASR client derive one from the MIME type). */
  filename: string | undefined
  /** Seconds, when known (null if the browser could not decode the file). */
  durationSec: number | null
  /** true when the blob is our own 16 kHz mono WAV; false = the original file is uploaded as-is. */
  converted: boolean
}

function hasOfflineAudio(): boolean {
  return typeof OfflineAudioContext !== 'undefined'
}

/**
 * Decode any browser-supported audio blob. Uses a tiny OfflineAudioContext (no audio device, no
 * autoplay permission) at 16 kHz, so `decodeAudioData` also resamples. Returns null when the
 * browser cannot decode it (e.g. m4a on Firefox without system codecs).
 */
export async function decodeAudio(blob: Blob): Promise<AudioBuffer | null> {
  if (!hasOfflineAudio()) return null
  try {
    const bytes = await blob.arrayBuffer()
    const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: ASR_SAMPLE_RATE })
    return await ctx.decodeAudioData(bytes)
  } catch {
    return null
  }
}

/**
 * Render a decoded buffer to 16 kHz mono PCM16 WAV, keeping at most `maxSec` seconds.
 * The 1-channel OfflineAudioContext down-mixes stereo automatically (speaker interpretation).
 */
export async function renderWav16k(buffer: AudioBuffer, maxSec?: number): Promise<Blob> {
  const seconds = maxSec ? Math.min(buffer.duration, maxSec) : buffer.duration
  const length = Math.max(1, Math.ceil(seconds * ASR_SAMPLE_RATE))
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate: ASR_SAMPLE_RATE })
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
  const rendered = await ctx.startRendering()
  return new Blob([encodeWavPcm16(rendered.getChannelData(0), ASR_SAMPLE_RATE)], { type: 'audio/wav' })
}

function originalName(blob: Blob): string | undefined {
  return typeof File !== 'undefined' && blob instanceof File && blob.name ? blob.name : undefined
}

/**
 * Convert a recording or file to the backend's preferred format (16 kHz mono WAV, ≤ `maxSec`).
 * On ANY failure it falls back to uploading the ORIGINAL blob and lets the server decode it
 * (no client-side FIR resampler in v1).
 */
export async function toWav16k(blob: Blob, opts: { maxSec?: number } = {}): Promise<PreparedAudio> {
  try {
    const decoded = await decodeAudio(blob)
    if (decoded) {
      const wav = await renderWav16k(decoded, opts.maxSec)
      const durationSec = opts.maxSec ? Math.min(decoded.duration, opts.maxSec) : decoded.duration
      return { blob: wav, filename: 'recording.wav', durationSec, converted: true }
    }
  } catch {
    // fall through to the original file
  }
  return { blob, filename: originalName(blob), durationSec: null, converted: false }
}
