import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/layout/SkipLink'
import { prefetchAsrStatus } from '@/features/demo/asrStatus'
import { DemoSection } from '@/features/demo/DemoSection'
import { prefetchMotionAi } from '@/features/demo/motionAi'
import { prefetchParser } from '@/features/demo/pipeline'
import { LazyResearch } from './LazyResearch'
import { prefetchResearch } from './loadResearch'
import { SectionBoundary } from './SectionBoundary'
import { ThemeController } from './ThemeController'
import { useEffect } from 'react'

export function App() {
  useEffect(() => {
    void prefetchParser()
    prefetchMotionAi()
    prefetchAsrStatus()
    prefetchResearch()
  }, [])
  return (
    <>
      <ThemeController />
      <SkipLink />
      <Header />
      <main>
        <SectionBoundary section="demo">
          <DemoSection />
        </SectionBoundary>
        <SectionBoundary section="research">
          <LazyResearch />
        </SectionBoundary>
      </main>
      <Footer />
    </>
  )
}
