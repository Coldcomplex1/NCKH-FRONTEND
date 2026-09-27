import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDemo } from '@/store/demoStore'
import { prefetchAsrStatus, refreshAsrStatus } from './asrStatus'

const BASE = 'https://asr.example.org'
const ok = () =>
  new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  useDemo.setState({ asr: 'unknown' })
})

describe('asrStatus', () => {
  it('stores the backend state', async () => {
    const fetchImpl = vi.fn(async () => ok())
    expect(await refreshAsrStatus({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(
      'ok',
    )
    expect(useDemo.getState().asr).toBe('ok')

    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await refreshAsrStatus({ baseUrl: BASE, fetchImpl: down as unknown as typeof fetch })
    expect(useDemo.getState().asr).toBe('offline')
  })

  it('calls made while a check is in flight share it', async () => {
    let release!: (r: Response) => void
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const opts = { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }
    const a = refreshAsrStatus(opts)
    const b = refreshAsrStatus(opts)
    release(ok())
    expect(await a).toBe('ok')
    expect(await b).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('prefetch does nothing without VITE_ASR_URL (tests have none)', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    prefetchAsrStatus()
    expect(spy).not.toHaveBeenCalled()
    expect(useDemo.getState().asr).toBe('unknown')
  })
})
