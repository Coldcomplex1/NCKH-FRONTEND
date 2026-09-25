import { describe, expect, it } from 'vitest'
import { fileExtension, validateFile } from './validateFile'

const MB = 1024 * 1024

describe('fileExtension', () => {
  it('lowercases and handles names without an extension', () => {
    expect(fileExtension('Lenh.WAV')).toBe('wav')
    expect(fileExtension('a.b.m4a')).toBe('m4a')
    expect(fileExtension('noext')).toBe('')
    expect(fileExtension('trailing.')).toBe('')
  })
})

describe('validateFile', () => {
  it('accepts every whitelisted extension with a matching or empty MIME type', () => {
    expect(validateFile({ name: 'a.wav', type: 'audio/wav', size: 1000 }, 10)).toEqual({
      ok: true,
      ext: 'wav',
    })
    expect(validateFile({ name: 'a.mp3', type: 'audio/mpeg', size: 1000 }, 10)).toMatchObject({ ok: true })
    expect(validateFile({ name: 'a.m4a', type: 'audio/x-m4a', size: 1000 }, 10)).toMatchObject({ ok: true })
    expect(validateFile({ name: 'a.webm', type: 'audio/webm;codecs=opus', size: 1000 }, 10)).toMatchObject({
      ok: true,
    })
    expect(validateFile({ name: 'a.ogg', type: '', size: 1000 }, 10)).toMatchObject({ ok: true, ext: 'ogg' })
  })

  it('rejects other extensions or MIME types', () => {
    expect(validateFile({ name: 'a.flac', type: 'audio/flac', size: 1000 }, 10)).toEqual({
      ok: false,
      problem: 'type',
      maxMB: 10,
    })
    expect(validateFile({ name: 'a.wav', type: 'text/plain', size: 1000 }, 10)).toMatchObject({
      ok: false,
      problem: 'type',
    })
    expect(validateFile({ name: 'song', type: 'audio/mpeg', size: 1000 }, 10)).toMatchObject({
      problem: 'type',
    })
  })

  it('rejects empty files and files over the size limit (inclusive boundary)', () => {
    expect(validateFile({ name: 'a.wav', type: 'audio/wav', size: 0 }, 10)).toMatchObject({
      problem: 'empty',
    })
    expect(validateFile({ name: 'a.wav', type: 'audio/wav', size: 10 * MB }, 10)).toMatchObject({ ok: true })
    expect(validateFile({ name: 'a.wav', type: 'audio/wav', size: 10 * MB + 1 }, 10)).toEqual({
      ok: false,
      problem: 'size',
      maxMB: 10,
    })
  })
})
