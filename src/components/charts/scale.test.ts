import { describe, expect, it } from 'vitest'
import { starPath } from './marks'
import { clamp, linear, niceDomain, niceMax, niceStep, rangeTicks } from './scale'

describe('chart scales', () => {
  it('maps linearly and handles a zero-width domain', () => {
    const x = linear([250, 2250], [64, 616])
    expect(x(250)).toBe(64)
    expect(x(2250)).toBe(616)
    expect(x(1250)).toBe(340)
    expect(linear([1, 1], [5, 10])(1)).toBe(5)
  })

  it('picks nice steps and domains without float noise', () => {
    expect(niceStep(10, 5)).toBe(2)
    expect(niceStep(0.0086, 4)).toBe(0.0025)
    expect(niceDomain(0.083, 0.0923, 3)).toEqual({ domain: [0.08, 0.095], ticks: [0.08, 0.085, 0.09, 0.095] })
    expect(niceMax(0.0849)).toBe(0.1)
    expect(rangeTicks(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3])
    expect(clamp(5, 0, 1)).toBe(1)
  })

  it('draws a closed 10-point star', () => {
    const d = starPath(11, 11, 10, 4.5)
    expect(d.startsWith('M11.0,1.0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.split('L')).toHaveLength(10)
  })
})
