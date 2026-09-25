import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
/** Desktop two-panel layout breakpoint (Tailwind `lg`). */
export const useIsWideLayout = () => useMediaQuery('(min-width: 64rem)')
export const useIsCoarsePointer = () => useMediaQuery('(pointer: coarse)')

/** true while the element is at least `threshold` visible. */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.05): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, threshold])
  return inView
}
