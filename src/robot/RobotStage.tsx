import { useProgress } from '@react-three/drei'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Home, RotateCcw } from 'lucide-react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { NeutralToneMapping, type Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { engine } from '@/engine'
import { MODEL_URL } from '@/engine/spec'
import { useDict, useFmt } from '@/i18n'
import { cn } from '@/lib/cn'
import { useIsWideLayout, useMediaQuery } from '@/lib/hooks'
import { demo, useDemo } from '@/store/demoStore'
import { robotDict } from './dict'
import { Robot2D, type FallbackReason } from './fallback/Robot2D'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { StageButton } from './StageButton'
import { CameraRig } from './scene/CameraRig'
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, VIEW_DIR, fitCamera, homeTarget } from './scene/cameraFit'
import { Fan } from './scene/Fan'
import { Lamp } from './scene/Lamp'
import { paletteFor, useSceneDark } from './scene/palette'
import { Robot } from './scene/Robot'
import { Room } from './scene/Room'
import { hasWebGL2 } from './webgl'

export interface RobotStageProps {
  /** false while the demo is scrolled out of view (pause the render loop). */
  active: boolean
  reducedMotion: boolean
}

/** Mouse-only devices get OrbitControls (on touch they would block page scrolling). */
const ORBIT_QUERY = '(pointer: fine) and (hover: hover)'
const SLOW_MS = 15_000

/**
 * The robot panel's 3D stage (lazy chunk: three + R3F + drei live only here). It renders the canvas,
 * its own loading overlay and two buttons; the speech bubble, cards and timers are DOM overlays
 * owned by the demo UI. Falls back to a 2D drawing without WebGL2 or when the scene fails.
 */
export default function RobotStage({ active, reducedMotion }: RobotStageProps) {
  const [webgl] = useState(hasWebGL2)
  const [failure, setFailure] = useState<FallbackReason | null>(webgl ? null : 'no-webgl')
  const [attempt, setAttempt] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const finePointer = useMediaQuery(ORBIT_QUERY)
  const anyTouch = useMediaQuery('(any-pointer: coarse)')
  const orbit = finePointer && !anyTouch
  const ready = useDemo((s) => s.scene.status === 'ready')
  // On wide layouts the demo's info card floats over the bottom-right corner: step aside meanwhile.
  const wide = useIsWideLayout()
  const cardOver = useDemo((s) => s.card !== null) && wide
  const t = useDict(robotDict)

  useEffect(() => {
    if (failure === 'no-webgl') demo().setScene({ status: 'no-webgl', progress: null })
    else if (failure) demo().setScene({ status: 'error', progress: null })
  }, [failure])

  const retry = useCallback(() => {
    useLoader.clear(GLTFLoader, MODEL_URL)
    demo().setScene({ status: 'loading', progress: null })
    setFailure(null)
    setAttempt((a) => a + 1)
  }, [])

  const onError = useCallback(() => setFailure('error'), [])
  const onLost = useCallback(() => setFailure('lost'), [])

  return (
    <div className="robot-stage @container absolute inset-0">
      {failure ? (
        <Robot2D reason={failure} onRetry={failure === 'no-webgl' ? undefined : retry} />
      ) : (
        <>
          <SceneErrorBoundary key={attempt} onError={onError}>
            <Scene
              active={active}
              reducedMotion={reducedMotion}
              orbit={orbit}
              resetKey={resetKey}
              onLost={onLost}
            />
          </SceneErrorBoundary>
          <LoadingOverlay reducedMotion={reducedMotion} />
          {ready && !cardOver ? (
            <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-2 sm:right-4 sm:bottom-4">
              {orbit ? (
                <StageButton
                  label={t.resetView}
                  icon={<RotateCcw className="size-5" />}
                  onClick={() => setResetKey((k) => k + 1)}
                />
              ) : null}
              <StageButton
                label={t.home}
                icon={<Home className="size-5" />}
                onClick={() => engine.returnHome()}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function Scene({
  active,
  reducedMotion,
  orbit,
  resetKey,
  onLost,
}: {
  active: boolean
  reducedMotion: boolean
  orbit: boolean
  resetKey: number
  onLost(): void
}) {
  const t = useDict(robotDict)
  const dark = useSceneDark()
  const palette = paletteFor(dark)
  const root = useRef<Group>(null)

  // Initial camera (the rig takes over on the first frame).
  const [initial] = useState(() => {
    const { distance: d, biasX } = fitCamera(1)
    const [x, y, z] = homeTarget(biasX)
    return [x + VIEW_DIR[0] * d, y + VIEW_DIR[1] * d, z + VIEW_DIR[2] * d] as [number, number, number]
  })

  return (
    <Canvas
      aria-label={t.canvasLabel}
      role="img"
      dpr={[1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
      camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: initial }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping
        gl.setClearColor(0x000000, 0)
      }}
    >
      <FrameloopSync active={active} />
      <ContextLossWatcher onLost={onLost} />
      <Room palette={palette} />
      <Lamp palette={palette} />
      <Fan palette={palette} />
      <Suspense fallback={null}>
        <Robot root={root} palette={palette} />
      </Suspense>
      <CameraRig target={root} reducedMotion={reducedMotion} orbit={orbit} resetKey={resetKey} />
    </Canvas>
  )
}

/** Pause rendering (and controller time) while the demo is off-screen. */
function FrameloopSync({ active }: { active: boolean }) {
  const setFrameloop = useThree((s) => s.setFrameloop)
  useEffect(() => {
    setFrameloop(active ? 'always' : 'never')
  }, [active, setFrameloop])
  return null
}

/** A lost WebGL context (GPU reset, too many contexts) switches the stage to the 2D fallback. */
function ContextLossWatcher({ onLost }: { onLost(): void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const canvas = gl.domElement
    let alive = true
    const lost = (e: Event) => {
      e.preventDefault()
      if (alive) onLost()
    }
    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      alive = false
      canvas.removeEventListener('webglcontextlost', lost)
    }
  }, [gl, onLost])
  return null
}

function LoadingOverlay({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useDict(robotDict)
  const fmt = useFmt()
  const scene = useDemo((s) => s.scene)
  const itemProgress = useProgress((s) => (s.total > 0 ? s.loaded / s.total : null))
  const [slow, setSlow] = useState(false)
  const loading = scene.status === 'loading'

  useEffect(() => {
    if (!loading) return
    const id = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(id)
  }, [loading])

  if (!loading) return null
  const p = scene.progress ?? (itemProgress !== null && itemProgress < 1 ? itemProgress : null)
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface/90 px-6 py-4 text-center shadow-soft">
        <p className="font-display text-xl font-bold text-ink">
          {p !== null ? t.loadingPct(fmt.pct(p, 0)) : t.loading}
        </p>
        {p !== null ? (
          <div className="h-2.5 w-48 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
        ) : (
          <div className="flex gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn('size-3 rounded-full bg-primary', !reducedMotion && 'animate-dot')}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
        {slow ? <p className="text-sm text-muted">{t.slow}</p> : null}
      </div>
    </div>
  )
}
