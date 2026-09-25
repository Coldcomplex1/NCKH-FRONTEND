import { describe, expect, it } from 'vitest'
import { FAN_OMEGA, stepFanOmega } from './fanMotion'

const simulate = (from: number, to: number, seconds: number) => {
  let w = from
  for (let i = 0; i < seconds * 60; i++) w = stepFanOmega(w, to, 1 / 60)
  return w
}

describe('fan motion', () => {
  it('eases toward the speed target and spins down more slowly than up', () => {
    const up = simulate(0, FAN_OMEGA[3], 1)
    const down = FAN_OMEGA[3] - simulate(FAN_OMEGA[3], 0, 1)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(FAN_OMEGA[3])
    expect(up).toBeGreaterThan(down)
    expect(simulate(0, FAN_OMEGA[2], 12)).toBe(FAN_OMEGA[2])
    expect(simulate(FAN_OMEGA[1], 0, 20)).toBe(0)
  })
})
