import { useEffect, useState } from 'react'

/**
 * `Date.now()`, re-rendering about every `intervalMs` while `enabled` (ticks are aligned to whole
 * intervals, so a clock changes exactly on the second). Values are recomputed from the wall clock
 * each tick, so throttled background tabs catch up as soon as they run again.
 */
export function useNow(enabled = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const t = Date.now()
      setNow(t)
      timer = setTimeout(tick, intervalMs - (t % intervalMs) + 5)
    }
    tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer)
        tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs])
  return now
}
