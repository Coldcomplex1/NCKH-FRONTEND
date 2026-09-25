import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demo } from '@/store/demoStore'
import { engine } from './index'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('engine singleton (production wiring)', () => {
  it('loads in node and answers without a robot or a voice', async () => {
    demo().startTurn({ id: 'smoke', at: Date.now(), source: 'text', heard: '…' })
    const p = engine.submit({
      turnId: 'smoke',
      actions: [{ type: 'time' }],
      notes: [],
      hasUnknown: false,
      suggestions: [],
      lang: 'vi',
    })
    await vi.advanceTimersByTimeAsync(5_000)
    const out = await p
    expect(out).toMatchObject({ status: 'done', replies: [{ key: 'info.time' }] })
    expect(demo().turns[0]?.replies.map((r) => r.key)).toEqual(['info.time'])
    expect(demo().card?.card.kind).toBe('time')
  })
})
