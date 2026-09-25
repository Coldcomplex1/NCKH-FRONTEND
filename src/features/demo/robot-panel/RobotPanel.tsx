import { lazy, Suspense, useRef } from 'react'
import { useDict } from '@/i18n'
import { useInView, usePrefersReducedMotion } from '@/lib/hooks'
import { demoDict } from '../dict'
import { ROBOT_PANEL_ID } from '../ids'
import { InfoCardView } from './InfoCardView'
import { LiveRegion } from './LiveRegion'
import { RoomStatus } from './RoomStatus'
import { SpeechBubble } from './SpeechBubble'
import { StageBoundary, StageLoading } from './StageFallbacks'
import { TimerPill } from './TimerPill'

/** three + R3F + drei live in this lazy chunk, never in the main bundle. */
const RobotStage = lazy(() => import('@/robot/RobotStage'))

/**
 * LEFT column: the 3D room with Ronaldo plus the DOM overlays (bubble, timers, room chips, info
 * card, live region). Desktop: fills the sticky column. Mobile: not sticky; a fixed-height room
 * (min(32svh, 300px), at least 14rem) under a bubble strip that grows with the reply, so the
 * command box still shows below it on a typical phone. The info card flows below the room, so
 * nothing covers the robot on a small screen.
 */
export function RobotPanel() {
  const t = useDict(demoDict).robot
  const boxRef = useRef<HTMLDivElement>(null)
  const active = useInView(boxRef)
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div
      id={ROBOT_PANEL_ID}
      role="region"
      aria-label={t.panelLabel}
      className="relative flex scroll-mt-(--header-h) flex-col gap-3 lg:h-full"
    >
      <div
        ref={boxRef}
        className="relative isolate flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-linear-to-b from-room-top to-room-bottom shadow-pop lg:block lg:h-full"
      >
        {/*
          Bubble + timers. Phones: a strip ABOVE the room that grows with the reply, so the bubble never
          hides the robot; the room below keeps a fixed height, so the canvas never resizes (no
          re-framing) when a reply changes length. Desktop: floats over the room.
          The layer ignores the pointer (the canvas stays draggable); widgets opt back in.
        */}
        <div className="pointer-events-none relative z-10 flex min-h-32 shrink-0 items-start justify-between gap-3 p-3 sm:p-4 lg:absolute lg:inset-x-0 lg:top-0 lg:h-auto">
          <div className="min-w-0 flex-1 lg:max-w-[75%] lg:flex-none">
            <SpeechBubble />
          </div>
          <div className="shrink-0">
            <TimerPill />
          </div>
        </div>

        <div className="relative h-[min(32svh,300px)] min-h-56 shrink-0 lg:absolute lg:inset-0 lg:h-auto lg:min-h-0">
          <div className="robot-stage absolute inset-0">
            <StageBoundary>
              <Suspense fallback={<StageLoading />}>
                <RobotStage active={active} reducedMotion={reducedMotion} />
              </Suspense>
            </StageBoundary>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 z-10 max-w-full p-3 sm:p-4 lg:max-w-[45%]">
          <RoomStatus />
        </div>
      </div>

      {/* Desktop: overlaid bottom-right of the room. Mobile: flows under it (never covers the robot). */}
      <div className="empty:hidden lg:pointer-events-none lg:absolute lg:right-4 lg:bottom-4 lg:w-[min(26rem,52%)]">
        <InfoCardView />
      </div>

      <LiveRegion />
    </div>
  )
}
