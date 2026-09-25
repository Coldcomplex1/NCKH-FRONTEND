// @ts-nocheck — runs in Node (tsconfig has no node types) to parse the CSS token file directly.
// CS-16 regression: nothing previously read src/styles/index.css or computed contrast, so a token
// edit could silently drop below WCAG AA. This parses the `:root` (light) and
// `:root[data-theme='dark']` (dark) token blocks and checks the text/UI pairs the finding lists.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

function block(selectorRe: RegExp): string {
  const m = css.match(selectorRe)
  if (!m || m.index === undefined) throw new Error(`selector not found in index.css: ${selectorRe}`)
  const start = m.index + m[0].length
  const end = css.indexOf('\n}', start)
  if (end === -1) throw new Error('closing brace not found')
  return css.slice(start, end)
}

function tokens(cssBlock: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of cssBlock.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    out[m[1]] = m[2].toLowerCase()
  }
  return out
}

const light = tokens(block(/:root\s*\{/))
const dark = tokens(block(/:root\[data-theme=['"]dark['"]\]\s*\{/))

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [rl, gl, bl] = [linear(r), linear(g), linear(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** WCAG 2.x contrast ratio, 1–21. */
function contrast(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

// [foreground token, background token] — every text pair the design tokens comment claims is AA.
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'bg'],
  ['ink-muted', 'surface-2'],
  ['success', 'surface'],
  ['central-ink', 'surface'],
  ['accent-ink', 'accent-soft'],
  ['success', 'success-soft'],
  ['danger', 'danger-soft'],
]

describe.each([['light', light] as const, ['dark', dark] as const])(
  '%s theme design-token contrast (CS-16)',
  (_themeName, themeTokens) => {
    it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1 (WCAG AA text)', (fg, bg) => {
      expect(themeTokens[fg]).toBeDefined()
      expect(themeTokens[bg]).toBeDefined()
      expect(contrast(themeTokens[fg], themeTokens[bg])).toBeGreaterThanOrEqual(4.5)
    })

    it('line-strong on surface is at least 3:1 (WCAG AA non-text UI component)', () => {
      expect(contrast(themeTokens['line-strong'], themeTokens.surface)).toBeGreaterThanOrEqual(3)
    })
  },
)
