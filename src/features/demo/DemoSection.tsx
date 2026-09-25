import { useDict } from '@/i18n'
import { demoDict } from './dict'
import { InputPanel } from './input-panel/InputPanel'
import { RobotPanel } from './robot-panel/RobotPanel'

/**
 * The full-viewport demo: robot (LEFT, sticky on desktop) + input panel (RIGHT, flows with the page).
 * Mobile: stacked, robot first (fixed-height room + growing bubble strip), not sticky.
 * Holds the page's only h1 (visually hidden).
 */
export function DemoSection() {
  const t = useDict(demoDict).section
  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className="mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8"
    >
      <h1 id="demo-title" className="sr-only">
        {t.title}
      </h1>
      <div className="grid gap-5 py-4 sm:py-5 lg:min-h-[calc(100dvh-var(--header-h))] lg:grid-cols-[58fr_42fr] lg:gap-8 lg:py-0">
        <div className="min-w-0 lg:sticky lg:top-(--header-h) lg:h-[calc(100dvh-var(--header-h))] lg:self-start lg:py-6">
          <RobotPanel />
        </div>
        <div className="min-w-0 lg:py-6">
          <InputPanel />
        </div>
      </div>
    </section>
  )
}
