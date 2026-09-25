import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Tracks an element's content-box size with ResizeObserver, so SVG charts can render in real pixels
 * (their 16px labels never scale down with a viewBox). `fallback` is used until the first measure
 * and where layout is unavailable (jsdom).
 */
export function useElementSize<T extends HTMLElement>(fallback: { width: number; height: number }) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (width: number, height: number) => {
      if (width <= 0) return
      setSize((prev) =>
        Math.round(prev.width) === Math.round(width) && Math.round(prev.height) === Math.round(height)
          ? prev
          : { width, height },
      )
    }
    measure(el.clientWidth, el.clientHeight)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) measure(box.width, box.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, size] as const
}
