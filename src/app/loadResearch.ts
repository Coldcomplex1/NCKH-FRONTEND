/** The research section's chunk (shared by the lazy component and the idle-time prefetch). */
export const loadResearch = () => import('@/features/research/ResearchSection')

/** Start downloading right after first paint instead of waiting for React to reach the component. */
export function prefetchResearch(): void {
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 800)
  // A failed prefetch is not an error yet: the section retries when it renders (and shows a fallback).
  idle(() => void loadResearch().catch(() => {}))
}
