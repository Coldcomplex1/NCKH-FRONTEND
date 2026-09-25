/**
 * Minimal WAV (RIFF) encoder: mono, 16-bit signed PCM, little-endian — the format the ASR backend
 * expects (16 kHz mono PCM16). 30 s at 16 kHz ≈ 960 KB.
 */

/** Size of the canonical PCM WAV header in bytes. */
export const WAV_HEADER_BYTES = 44

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/**
 * Encode float samples in [-1, 1] as a mono PCM16 WAV file.
 * Out-of-range samples are clamped; negative values scale by 0x8000, positive by 0x7FFF so both
 * ends map exactly onto the int16 range. NaN is written as silence.
 */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const channels = 1
  const bytesPerSample = 2
  const dataBytes = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // file size - 8
  writeAscii(view, 8, 'WAVE')
  // "fmt " sub-chunk
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // sub-chunk size for PCM
  view.setUint16(20, 1, true) // audio format 1 = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true) // byte rate
  view.setUint16(32, channels * bytesPerSample, true) // block align
  view.setUint16(34, 8 * bytesPerSample, true) // bits per sample
  // "data" sub-chunk
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = WAV_HEADER_BYTES
  for (let i = 0; i < samples.length; i++) {
    const raw = samples[i] ?? 0
    const s = Number.isNaN(raw) ? 0 : Math.max(-1, Math.min(1, raw))
    view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
    offset += bytesPerSample
  }
  return buffer
}
