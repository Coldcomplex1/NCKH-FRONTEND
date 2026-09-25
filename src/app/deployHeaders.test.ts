// @ts-nocheck — this test runs in Node (tsconfig has no node types) to check the deploy configs.
// CS-06 regression: both vercel.json and netlify.toml must ship a CSP for the app HTML (scoped to
// "/" and "/index.html" only — NOT the catch-all "/*", which would also hit /reports/*) that pins
// the inline pre-paint <script> in index.html by its sha256 hash, plus a separate CSP for
// /reports/* pinning that file's own inline script. If index.html's inline script ever changes,
// this test fails until the hash in both config files is updated to match.
import { createHash } from 'node:crypto'
import { readFileSync as readFile } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

function sha256OfInlineScript(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('no bare <script> tag found')
  const hash = createHash('sha256').update(m[1], 'utf8').digest('base64')
  return `sha256-${hash}`
}

// Minimal extraction for our own netlify.toml shape: `[[headers]]` blocks each followed by
// `for = "..."` and a `[headers.values]` table. No general TOML parsing needed.
function netlifyHeaderBlocks(toml: string): { for: string; values: Record<string, string> }[] {
  const blocks = toml.split(/\n(?=\[\[headers\]\])/g).filter((b) => b.startsWith('[[headers]]'))
  return blocks.map((block) => {
    const forMatch = block.match(/for\s*=\s*"([^"]*)"/)
    const values: Record<string, string> = {}
    for (const m of block.matchAll(/^\s*([\w-]+)\s*=\s*"([^"]*)"/gm)) {
      if (m[1] === 'for') continue
      values[m[1]] = m[2]
    }
    return { for: forMatch?.[1] ?? '', values }
  })
}

describe('deploy header configs (CS-06)', () => {
  const indexHtml = readFile(resolve(root, 'index.html'), 'utf8')
  const reportHtml = readFile(resolve(root, 'public/reports/run-results-dashboard.html'), 'utf8')
  const appHash = sha256OfInlineScript(indexHtml)
  const reportHash = sha256OfInlineScript(reportHtml)

  const vercel = JSON.parse(readFile(resolve(root, 'vercel.json'), 'utf8'))
  const netlifyBlocks = netlifyHeaderBlocks(readFile(resolve(root, 'netlify.toml'), 'utf8'))

  function vercelCsp(source: string): string | undefined {
    const rule = vercel.headers.find((h: { source: string }) => h.source === source)
    return rule?.headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')?.value
  }
  function netlifyCsp(forPattern: string): string | undefined {
    return netlifyBlocks.find((b) => b.for === forPattern)?.values['Content-Security-Policy']
  }
  function headerValue(key: string): { vercel: string | undefined; netlify: string | undefined } {
    const vRule = vercel.headers.find((h: { source: string }) => h.source === '/(.*)')
    const v = vRule?.headers.find((h: { key: string }) => h.key === key)?.value
    const n = netlifyBlocks.find((b) => b.for === '/*')?.values[key]
    return { vercel: v, netlify: n }
  }

  it('index.html sha256 matches the hash pinned in both config files', () => {
    expect(vercelCsp('/')).toContain(appHash)
    expect(vercelCsp('/index.html')).toContain(appHash)
    expect(netlifyCsp('/')).toContain(appHash)
    expect(netlifyCsp('/index.html')).toContain(appHash)
  })

  it('/reports/run-results-dashboard.html sha256 matches the hash pinned for /reports/*', () => {
    expect(vercelCsp('/reports/(.*)')).toContain(reportHash)
    expect(netlifyCsp('/reports/*')).toContain(reportHash)
  })

  it('vercel.json and netlify.toml define the same app CSP', () => {
    const v = vercelCsp('/')
    expect(v).toBeTruthy()
    expect(vercelCsp('/index.html')).toBe(v)
    expect(netlifyCsp('/')).toBe(v)
    expect(netlifyCsp('/index.html')).toBe(v)
  })

  it('vercel.json and netlify.toml define the same /reports/* CSP', () => {
    const v = vercelCsp('/reports/(.*)')
    expect(v).toBeTruthy()
    expect(netlifyCsp('/reports/*')).toBe(v)
  })

  it('the app CSP is not applied through the catch-all source (would also hit /reports/*)', () => {
    expect(headerValue('Content-Security-Policy').vercel).toBeUndefined()
    expect(headerValue('Content-Security-Policy').netlify).toBeUndefined()
  })

  it('both configs set X-Frame-Options: DENY', () => {
    expect(headerValue('X-Frame-Options').vercel).toBe('DENY')
    expect(headerValue('X-Frame-Options').netlify).toBe('DENY')
  })
})
