import { lazy, Suspense, useEffect } from 'react'

/**
 * The research section is below the fold, so it lives in its own chunk: the demo paints first and
 * the research code is fetched as soon as the browser is idle (or when the user scrolls/links to it).
 */
import { loadResearch as load } from './loadResearch'

const ResearchSection = lazy(() =>
  load().then((m) => ({
    default: function ResearchWithDeepLink() {
      useDeepLinkScroll()
      return <m.ResearchSection />
    },
  })),
)

/** A deep link such as /#regions points inside the lazy section: scroll there once it has rendered. */
function useDeepLinkScroll() {
  useEffect(() => {
    const id = safeDecode(window.location.hash.slice(1))
    if (!id || id === 'demo' || id === 'research') return
    document.getElementById(id)?.scrollIntoView()
  }, [])
}

/** A hand-typed or truncated link (e.g. "#%E0%A4%A") must not throw during render. */
function safeDecode(hash: string): string {
  try {
    return decodeURIComponent(hash)
  } catch {
    return hash
  }
}

export function LazyResearch() {
  return (
    <Suspense
      fallback={
        // Same id as the real section, so header links and the skip-to-research anchor work while loading.
        <section id="research" aria-busy="true" className="min-h-screen" />
      }
    >
      <ResearchSection />
    </Suspense>
  )
}
