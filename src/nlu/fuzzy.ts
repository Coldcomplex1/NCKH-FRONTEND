/** Optimal string alignment distance, bounded: returns max + 1 as soon as the distance exceeds `max`. */
export function osa(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let p2 = new Array<number>(b.length + 1).fill(0)
  let p1 = Array.from({ length: b.length + 1 }, (_, k) => k)
  let cur = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p1[j]! + 1, cur[j - 1]! + 1, p1[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2]! + 1)
      cur[j] = v
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
    ;[p2, p1, cur] = [p1, cur, p2]
  }
  return p1[b.length]!
}

function grams(s: string): Map<string, number> {
  const t = `  ${s} `
  const m = new Map<string, number>()
  for (let i = 0; i + 3 <= t.length; i++) {
    const k = t.slice(i, i + 3)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** Character-trigram Dice coefficient (0–1). */
export function dice(a: string, b: string): number {
  const A = grams(a)
  const B = grams(b)
  let x = 0
  let n = 0
  for (const [k, v] of A) {
    x += Math.min(v, B.get(k) ?? 0)
    n += v
  }
  for (const v of B.values()) n += v
  return n ? (2 * x) / n : 0
}
