import { describe, expect, it } from 'vitest'
import { isInAppBrowser, mapMediaError, MIME_CANDIDATES, pickMimeType, recorderSupport } from './useRecorder'

describe('mapMediaError (CS-16)', () => {
  const cases: [string, ReturnType<typeof mapMediaError>][] = [
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no_device'],
    ['DevicesNotFoundError', 'no_device'],
    ['OverconstrainedError', 'no_device'],
    ['NotReadableError', 'busy'],
    ['TrackStartError', 'busy'],
    ['AbortError', 'busy'],
    ['TypeError', 'unsupported'],
    ['NotSupportedError', 'unsupported'],
    ['SomeUnknownError', 'failed'],
  ]

  it.each(cases)('maps %s to %s', (name, expected) => {
    expect(mapMediaError({ name })).toBe(expected)
  })

  it('maps a non-DOMException value to failed', () => {
    expect(mapMediaError('nope')).toBe('failed')
    expect(mapMediaError(undefined)).toBe('failed')
  })
})

describe('isInAppBrowser (CS-16)', () => {
  it('recognises common in-app WebView user agents', () => {
    expect(isInAppBrowser('Mozilla/5.0 ... Zalo/1.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) FBAN/FBIOS')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 Instagram 123.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 ... Line/11.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 ... MicroMessenger/8.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 ... musical_ly')).toBe(true)
  })

  it('does not flag an ordinary desktop/mobile browser', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36')).toBe(false)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false)
  })
})

describe('recorderSupport (CS-16)', () => {
  const base = { isSecureContext: true, hasGetUserMedia: true, hasMediaRecorder: true, userAgent: 'Chrome' }

  it('returns null when everything is supported over a secure context', () => {
    expect(recorderSupport(base)).toBeNull()
  })

  it('returns insecure when isSecureContext is false, even if APIs exist', () => {
    expect(recorderSupport({ ...base, isSecureContext: false })).toBe('insecure')
  })

  it('returns unsupported when an API is missing on an ordinary browser', () => {
    expect(recorderSupport({ ...base, hasGetUserMedia: false })).toBe('unsupported')
    expect(recorderSupport({ ...base, hasMediaRecorder: false })).toBe('unsupported')
  })

  it('returns in_app when an API is missing and the UA is an in-app WebView', () => {
    expect(recorderSupport({ ...base, hasGetUserMedia: false, userAgent: 'Zalo/1.0' })).toBe('in_app')
  })
})

describe('pickMimeType (CS-16)', () => {
  it('returns the first candidate the browser reports as supported', () => {
    expect(pickMimeType((t) => t === MIME_CANDIDATES[2])).toBe(MIME_CANDIDATES[2])
  })

  it('returns the earliest-preference match when several are supported', () => {
    expect(pickMimeType(() => true)).toBe(MIME_CANDIDATES[0])
  })

  it('returns undefined when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeUndefined()
  })

  it('treats a throwing isTypeSupported as unsupported for that candidate, not a crash', () => {
    expect(
      pickMimeType((t) => {
        if (t === MIME_CANDIDATES[0]) throw new Error('boom')
        return t === MIME_CANDIDATES[1]
      }),
    ).toBe(MIME_CANDIDATES[1])
  })
})
