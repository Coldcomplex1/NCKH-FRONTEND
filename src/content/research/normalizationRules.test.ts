import { describe, expect, it } from 'vitest'
import { results } from '../results'
import { copyEn } from './copy.en'
import { copyVi } from './copy.vi'

describe('normalization rule keys (CS-01 regression)', () => {
  const rules = results.normalization.normalized

  it('every rule from results.json is NFC-normalized', () => {
    for (const rule of rules) {
      expect(rule.normalize('NFC')).toBe(rule)
    }
  })

  it.each(rules)('%s has a VI and an EN copy entry', (rule) => {
    expect(copyVi.dataset.normalization.rules[rule]).toBeDefined()
    expect(copyEn.dataset.normalization.rules[rule]).toBeDefined()
  })
})
