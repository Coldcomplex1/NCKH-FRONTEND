import { describe, expect, it } from 'vitest'
import { isAllowedAsrOrigin } from './env'

describe('isAllowedAsrOrigin (CS-05)', () => {
  it('allows any https:// origin, dev or prod', () => {
    expect(isAllowedAsrOrigin('https://asr.example.org', false)).toBe(true)
    expect(isAllowedAsrOrigin('https://asr.example.org', true)).toBe(true)
  })

  it('allows http://localhost and http://127.0.0.1 only in dev', () => {
    expect(isAllowedAsrOrigin('http://localhost:8000', true)).toBe(true)
    expect(isAllowedAsrOrigin('http://127.0.0.1:8000', true)).toBe(true)
    expect(isAllowedAsrOrigin('http://localhost:8000', false)).toBe(false)
    expect(isAllowedAsrOrigin('http://127.0.0.1:8000', false)).toBe(false)
  })

  it('rejects any other http:// origin, e.g. a LAN IP', () => {
    expect(isAllowedAsrOrigin('http://192.168.1.20:8000', true)).toBe(false)
    expect(isAllowedAsrOrigin('http://192.168.1.20:8000', false)).toBe(false)
  })

  it('rejects empty and unparseable values', () => {
    expect(isAllowedAsrOrigin('', true)).toBe(false)
    expect(isAllowedAsrOrigin('not a url', true)).toBe(false)
  })
})
