import { describe, expect, it } from 'vitest'
import { encodeWavPcm16, WAV_HEADER_BYTES } from './wav'

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

describe('encodeWavPcm16', () => {
  it('writes a canonical 44-byte mono PCM16 header', () => {
    const buf = encodeWavPcm16(new Float32Array(10), 16_000)
    const v = new DataView(buf)
    expect(buf.byteLength).toBe(WAV_HEADER_BYTES + 20)
    expect(ascii(v, 0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(36 + 20)
    expect(ascii(v, 8, 4)).toBe('WAVE')
    expect(ascii(v, 12, 4)).toBe('fmt ')
    expect(v.getUint32(16, true)).toBe(16)
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(16_000)
    expect(v.getUint32(28, true)).toBe(32_000) // byte rate
    expect(v.getUint16(32, true)).toBe(2) // block align
    expect(v.getUint16(34, true)).toBe(16) // bits
    expect(ascii(v, 36, 4)).toBe('data')
    expect(v.getUint32(40, true)).toBe(20)
  })

  it('maps samples onto the full int16 range, little-endian, clamping and silencing NaN', () => {
    const buf = encodeWavPcm16(new Float32Array([0, 1, -1, 0.5, -0.5, 2, -3, Number.NaN]), 16_000)
    const v = new DataView(buf)
    const s = (i: number) => v.getInt16(WAV_HEADER_BYTES + i * 2, true)
    expect(s(0)).toBe(0)
    expect(s(1)).toBe(32767)
    expect(s(2)).toBe(-32768)
    expect(s(3)).toBe(Math.round(0.5 * 0x7fff))
    expect(s(4)).toBe(-16384)
    expect(s(5)).toBe(32767)
    expect(s(6)).toBe(-32768)
    expect(s(7)).toBe(0)
    // little-endian: 0x7FFF → FF 7F
    expect(v.getUint8(WAV_HEADER_BYTES + 2)).toBe(0xff)
    expect(v.getUint8(WAV_HEADER_BYTES + 3)).toBe(0x7f)
  })

  it('30 s at 16 kHz is about 960 KB', () => {
    expect(encodeWavPcm16(new Float32Array(30 * 16_000), 16_000).byteLength).toBe(44 + 960_000)
  })
})
