import { RotateCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui'
import { useDict } from '@/i18n'
// No three.js in here: the 2D stand-in lives in the main chunk, so it still shows when the lazy
// 3D chunk cannot be fetched.
import { Robot2D } from '@/robot/fallback/Robot2D'
import { demo } from '@/store/demoStore'
import { demoDict } from '../dict'

const reload = () => window.location.reload()

/** A friendly robot silhouette (decorative) for the loading and error states. */
function RobotSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden="true" className={className} fill="none">
      <line x1="60" y1="6" x2="60" y2="22" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="8" r="6" fill="currentColor" />
      <rect x="22" y="22" width="76" height="56" rx="22" fill="currentColor" opacity="0.9" />
      <circle cx="46" cy="50" r="7" className="fill-surface" />
      <circle cx="74" cy="50" r="7" className="fill-surface" />
      <rect x="34" y="84" width="52" height="40" rx="14" fill="currentColor" opacity="0.75" />
      <rect x="10" y="88" width="18" height="30" rx="9" fill="currentColor" opacity="0.6" />
      <rect x="92" y="88" width="18" height="30" rx="9" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

/** Suspense fallback while the 3D chunk downloads. */
export function StageLoading() {
  const t = useDict(demoDict).robot
  return (
    // A short mobile stage (min(32svh,300px)) leaves little room: pt-3/gap-1/a smaller icon on
    // narrow screens keep this text clear of the room-status chips pinned to the bottom-left of
    // the same box; sm:+ restores the original spacing once the stage has height to spare.
    <div className="flex h-full flex-col items-center justify-center gap-0.5 px-3 pt-3 pb-14 text-center sm:gap-3 sm:p-6">
      <RobotSilhouette className="h-14 w-12 animate-pulse text-primary sm:h-36 sm:w-32" />
      <p className="font-display text-xl font-extrabold text-ink">{t.loading}</p>
      <p className="text-base text-muted">{t.loadingHint}</p>
    </div>
  )
}

function StageError() {
  const t = useDict(demoDict).robot
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-0.5 px-3 pt-3 pb-14 text-center sm:gap-3 sm:p-6">
      <RobotSilhouette className="h-14 w-12 text-muted sm:h-24 sm:w-20" />
      <p className="font-display text-xl font-extrabold text-ink">{t.stageError}</p>
      <p className="text-base text-muted">{t.stageErrorHint}</p>
      <Button icon={<RotateCw className="size-5" />} onClick={reload}>
        {t.reload}
      </Button>
    </div>
  )
}

/**
 * Catches a failed lazy import of the 3D chunk (offline, deploy mid-session) or a render crash in
 * the scene, and ends in the 2D fallback: the scene status becomes 'error' (so the engine runs
 * commands at once against the 2D robot instead of waiting for a body) and Robot2D is shown, with a
 * retry that reloads the page (a failed lazy import is cached). RobotStage has its own 2D fallback
 * for missing WebGL; this is the last line of defence.
 */
export class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[demo] robot stage failed', error, info.componentStack)
    demo().setScene({ status: 'error', progress: null })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <FallbackBoundary>
        <Robot2D reason="error" onRetry={reload} />
      </FallbackBoundary>
    )
  }
}

/** If even the 2D drawing fails, a plain message with a reload button. */
class FallbackBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('[demo] 2D robot failed', error)
  }

  render(): ReactNode {
    return this.state.failed ? <StageError /> : this.props.children
  }
}
