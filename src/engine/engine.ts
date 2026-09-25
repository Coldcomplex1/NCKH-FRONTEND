import type { EngineOutcome, EngineRequest, RobotEngine } from '@/core/engine'
import type { Lang } from '@/core/lang'
import { reply, type RenderedReply, type ReplyRef } from '@/core/replies'
import type { Speaker } from '@/core/speech'
import type { demo, TimerState } from '@/store/demoStore'
import { controllerBridge } from './bridge'
import { Execution, sleep, type ExecPrefs, type ExecutorDeps, type RunHandle } from './executor'
import {
  plan,
  planAlarm,
  planAlarmNotice,
  planReturnHome,
  planWelcome,
  splitForBody,
  type PlanRequest,
} from './planner'
import { HOME, NOT_READY_NOTICE_MS, READY_TIMEOUT_MS } from './spec'
import { TimerService } from './timers'
import type { AnimationController, PlannerSnapshot } from './types'

/**
 * The robot engine: a plain-TS singleton (no React) that turns parsed actions into behaviour.
 * `submit()` interrupts the current run (room state and timers are kept), plans against a snapshot
 * of the world and executes it:
 * - with the 3D robot, or against the 2D fallback when the 3D scene is unavailable for good (no
 *   WebGL, context lost, the 3D chunk failed): at once;
 * - while the 3D robot is still loading: everything that needs no body (answers, timers, the room)
 *   at once; only the motion waits for the body (≤10 s; "Mình đang khởi động…" after a moment).
 * It also owns the timer alarms (they pre-empt whatever is running; alarms that expire together,
 * or while another one is on screen, are queued so that each one is announced), the "(Hết giờ!)"
 * tab title, the silent welcome shown the first time the robot appears, and the "Về chỗ cũ" button.
 */

type Store = ReturnType<typeof demo>

export type EngineStore = Pick<
  Store,
  | 'robot'
  | 'room'
  | 'scene'
  | 'timers'
  | 'bubble'
  | 'setRun'
  | 'patchRun'
  | 'patchRobot'
  | 'patchBubble'
  | 'setBubble'
  | 'appendTurnReply'
  | 'announce'
  | 'showCard'
  | 'clearCard'
  | 'patchRoom'
  | 'addTimer'
  | 'patchTimer'
  | 'removeTimer'
>

export interface EngineDocument {
  readonly visibilityState: DocumentVisibilityState
  title: string
  addEventListener(type: 'visibilitychange', cb: () => void): void
  removeEventListener(type: 'visibilitychange', cb: () => void): void
}

export interface EngineDeps {
  store(): EngineStore
  /** Called on every store change (used while waiting for the 3D scene). */
  subscribeStore(cb: () => void): () => void
  prefs(): ExecPrefs
  bridge: {
    get(): AnimationController | null
    subscribe(cb: (ctrl: AnimationController | null) => void): () => void
  }
  speaker: Pick<Speaker, 'speak' | 'cancel'>
  render(ref: ReplyRef, lang: Lang): RenderedReply
  fetchWeather: ExecutorDeps['fetchWeather']
  /** The alarm sound (plays even when the reading voice is muted); may return a stop function. */
  beep: ExecutorDeps['beep']
  /** Create / resume the AudioContext (on every submit). */
  primeAudio(): void
  now(): number
  matches(query: string): boolean
  doc: EngineDocument | null
  /** Test-set WER (fraction) for the "project" intro. */
  projectWer?: number
  readyTimeoutMs: number
  /** Survives dev HMR, so the welcome is not repeated. */
  welcomed?: boolean
}

export interface EngineInstance extends RobotEngine {
  readonly timers: TimerService
  /** true once the welcome ran (or can no longer run). */
  readonly welcomed: boolean
  dispose(): void
}

export const ALARM_TITLE_PREFIX: Record<Lang, string> = { vi: '(Hết giờ!) ', en: "(Time's up!) " }

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const WIDE_LAYOUT = '(min-width: 64rem)'
const WAITING = Symbol('waiting')

type RunKind = 'turn' | 'alarm' | 'notice' | 'welcome' | 'home'

interface Run {
  id: number
  ac: AbortController
  kind: RunKind
  /** Alarm runs: the timers they announce, in order. */
  alarms?: TimerState[]
  handle?: RunHandle
}

export function createEngine(deps: EngineDeps): EngineInstance {
  const { store, bridge } = deps

  let runSeq = 0
  let current: Run | null = null
  let jokeIndex = 0
  let welcomed = deps.welcomed === true
  let alarmPrefix: string | null = null
  let disposed = false
  /** false until createEngine returns (the TimerService may fire while it is being constructed). */
  let constructed = false
  /** Expired timers not announced yet (they wait while another alarm is on screen). */
  let pendingAlarms: TimerState[] = []

  const timers = new TimerService({
    store: {
      getTimers: () => store().timers,
      addTimer: (t) => store().addTimer(t),
      patchTimer: (id, p) => store().patchTimer(id, p),
      removeTimer: (id) => store().removeTimer(id),
    },
    onFire: (fired) => onAlarm(fired),
    onRingEnd: () => refreshAlarmTitle(),
    now: deps.now,
    doc: deps.doc,
  })

  const execDeps: ExecutorDeps = {
    store,
    controller: () => bridge.get(),
    speaker: deps.speaker,
    render: deps.render,
    prefs: deps.prefs,
    timers,
    fetchWeather: deps.fetchWeather,
    beep: deps.beep,
  }

  function snapshot(): PlannerSnapshot {
    const s = store()
    const ctrl = bridge.get()
    let pose = { x: HOME.x, z: HOME.z, yaw: 0 }
    if (ctrl) {
      try {
        pose = ctrl.getPose()
      } catch {
        /* keep HOME */
      }
    }
    return {
      now: new Date(deps.now()),
      posture: s.robot.posture,
      pose,
      room: s.room,
      reducedMotion: deps.matches(REDUCED_MOTION),
      jokeIndex,
      ...(deps.projectWer !== undefined ? { projectWer: deps.projectWer } : {}),
    }
  }

  /** Plans a request that is about to run (the joke rotation advances). */
  function planNow(req: PlanRequest) {
    const p = plan(req, snapshot())
    jokeIndex += p.jokesUsed
    return p
  }

  /** No WebGL, a lost context or a failed 3D chunk: the 2D robot stands in and no body will come. */
  function sceneUnavailable(): boolean {
    const st = store().scene.status
    return st === 'no-webgl' || st === 'error'
  }

  // ---- runs

  function begin(turnId: string | null, kind: RunKind): Run {
    const run: Run = { id: ++runSeq, ac: new AbortController(), kind }
    current = run
    store().setRun({ id: run.id, turnId: turnId ?? '', index: 0, total: 0, status: 'running' })
    return run
  }

  /** Runs `body` (one or more phases of steps on one Execution), then cleans up after the run. */
  async function execRun(
    r: Run,
    turnId: string | null,
    body: (ex: Execution) => Promise<void>,
  ): Promise<EngineOutcome> {
    const handle: RunHandle = { id: r.id, turnId, signal: r.ac.signal, replies: [] }
    r.handle = handle
    const ex = new Execution(handle, execDeps)
    let status: EngineOutcome['status']
    try {
      await body(ex)
      status = await ex.finish()
    } catch (err) {
      console.error('[engine] run failed', err)
      status = r.ac.signal.aborted ? 'interrupted' : 'error'
      if (status === 'error' && current?.id === r.id) {
        const ref = reply('error.generic', {})
        store().setBubble(ref, 'sorry')
        if (turnId) store().appendTurnReply(turnId, ref)
        store().announce(ref)
        handle.replies.push(ref)
      }
    }
    if (current?.id === r.id) {
      current = null
      // settle() straightens the head and clears the face: a sleeping robot keeps its sleepy pose.
      if (status === 'done' && store().robot.posture !== 'sleeping') bridge.get()?.settle()
      store().patchRun(r.id, { status })
      neutral()
    }
    // Alarms that expired meanwhile (behind the alarm that just ended, say) go next.
    if (!current && !disposed) startAlarms()
    return { status, replies: handle.replies }
  }

  /** Like settle() on the 3D body: activity back to idle and a neutral face (the 2D robot draws these). */
  function neutral(): void {
    const s = store()
    if (s.robot.activity !== 'idle' || s.robot.expression !== null) {
      s.patchRobot({ activity: 'idle', expression: null })
    }
  }

  function interrupt(): void {
    const cur = current
    current = null
    deps.speaker.cancel()
    if (!cur) return
    cur.ac.abort()
    const ctrl = bridge.get()
    if (ctrl) {
      ctrl.cancel({ fade: 0.2 })
      // Keep the body's face in step with the store, which goes neutral below.
      if (store().robot.expression !== null) void ctrl.expression(null, 0, 300)
    }
    const s = store()
    s.patchRun(cur.id, { status: 'interrupted' })
    neutral()
    if (s.bubble?.speaking) s.patchBubble(s.bubble.id, { speaking: false })
  }

  /** Resolves with the controller, or null on timeout / abort / a failed scene. */
  function waitForController(signal: AbortSignal): Promise<AnimationController | null> {
    return new Promise((resolve) => {
      const existing = bridge.get()
      if (existing) return resolve(existing)
      if (sceneUnavailable() || signal.aborted) return resolve(null)
      let unsubBridge = () => {}
      let unsubStore = () => {}
      const finish = (c: AnimationController | null) => {
        clearTimeout(timeout)
        unsubBridge()
        unsubStore()
        signal.removeEventListener('abort', onAbort)
        resolve(c)
      }
      const onAbort = () => finish(null)
      const timeout = setTimeout(() => finish(bridge.get()), deps.readyTimeoutMs)
      unsubBridge = bridge.subscribe((c) => {
        if (c) finish(c)
      })
      unsubStore = deps.subscribeStore(() => {
        if (sceneUnavailable()) finish(null)
      })
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Waits for the 3D body; says "Mình đang khởi động…" if that takes more than a moment. */
  async function awaitBody(
    ex: Execution,
    r: Run,
    body: Promise<AnimationController | null>,
  ): Promise<AnimationController | null> {
    const first = await Promise.race([
      body,
      sleep(NOT_READY_NOTICE_MS, r.ac.signal).then((): typeof WAITING => WAITING),
    ])
    if (first !== WAITING) return first
    if (r.ac.signal.aborted) return null
    if (!sceneUnavailable()) {
      await ex.steps([{ op: 'say', reply: reply('robot.not_ready', {}), wait: false }])
    }
    return body
  }

  /** A body that attaches late (slow model load, WebGL context restored) takes the recorded posture. */
  function adoptPosture(c: AnimationController): void {
    const posture = store().robot.posture
    if (posture === 'standing') return
    try {
      c.holdPose(posture === 'lying' ? 'Death' : 'Sitting')
    } catch (err) {
      console.error('[engine] could not give the new body its posture', err)
    }
  }

  // ---- alarms and the alarm title

  function setAlarmTitle(): void {
    const doc = deps.doc
    if (!doc) return
    clearAlarmTitle()
    const prefix = ALARM_TITLE_PREFIX[deps.prefs().lang]
    doc.title = prefix + doc.title
    alarmPrefix = prefix
  }

  function clearAlarmTitle(): void {
    const doc = deps.doc
    if (!doc || alarmPrefix === null) return
    if (doc.title.startsWith(alarmPrefix)) doc.title = doc.title.slice(alarmPrefix.length)
    alarmPrefix = null
  }

  /**
   * The "(Hết giờ!)" prefix goes once no alarm rings any more; while the page is hidden it is the
   * only sign of the alarm, so there it stays until the page is visible again. `seen` (the alarm
   * was dismissed by hand) skips the visibility check.
   */
  function refreshAlarmTitle(seen = false): void {
    if (alarmPrefix === null) return
    if (pendingAlarms.length > 0 || store().timers.some((t) => t.ringing)) return
    if (!seen && deps.doc && deps.doc.visibilityState !== 'visible') return
    clearAlarmTitle()
  }

  function onAlarm(fired: TimerState[]): void {
    if (disposed) return
    pendingAlarms.push(...fired)
    setAlarmTitle()
    if (!constructed) return
    // An alarm already on screen finishes first; the new ones follow right after it.
    if (current?.kind === 'alarm') return
    startAlarms()
  }

  /** The pending alarms that still ring, taken off the queue; their ring restarts at the announcement. */
  function takePendingAlarms(): TimerState[] {
    const ringing = new Set(
      store()
        .timers.filter((t) => t.ringing)
        .map((t) => t.id),
    )
    const due = pendingAlarms.filter((t) => ringing.has(t.id))
    pendingAlarms = []
    for (const t of due) timers.ring(t.id)
    return due
  }

  /** Announces every pending alarm in one run (soonest first), pre-empting whatever is running. */
  function startAlarms(): void {
    if (disposed || pendingAlarms.length === 0) return
    const due = takePendingAlarms()
    if (due.length === 0) return refreshAlarmTitle()
    interrupt()
    const r = begin(null, 'alarm')
    r.alarms = due
    const steps = planAlarm(
      snapshot(),
      due.map((t) => t.label),
    ).steps
    void execRun(r, null, (ex) => ex.steps(steps))
  }

  // ---- welcome

  function maybeWelcome(): void {
    if (welcomed || disposed || current) return
    if (!bridge.get()) return
    if (deps.doc && deps.doc.visibilityState !== 'visible') return
    welcomed = true
    const layout = deps.matches(WIDE_LAYOUT) ? 'side' : 'stacked'
    const r = begin(null, 'welcome')
    const steps = planWelcome(snapshot(), layout).steps
    void execRun(r, null, (ex) => ex.steps(steps))
  }

  // The engine's own listener is registered first, so a new body has its posture before a waiting
  // command re-plans against it.
  const unsubscribeBridge = bridge.subscribe((c) => {
    if (!c) return
    adoptPosture(c)
    maybeWelcome()
  })
  const onVisibility = () => {
    refreshAlarmTitle()
    maybeWelcome()
  }
  deps.doc?.addEventListener('visibilitychange', onVisibility)

  // ---- public API

  const engine: EngineInstance = {
    timers,
    get welcomed() {
      return welcomed
    },

    async submit(req: EngineRequest): Promise<EngineOutcome> {
      // A command from the user: no welcome any more, audio unlocked, alarm title cleared.
      welcomed = true
      deps.primeAudio()
      clearAlarmTitle()
      interrupt()
      // Alarms queued behind the one this command cuts short are still announced, first.
      const due = takePendingAlarms()
      const r = begin(req.turnId, 'turn')
      const planReq: PlanRequest = {
        actions: req.actions,
        notes: req.notes,
        hasUnknown: req.hasUnknown,
        suggestions: req.suggestions,
      }
      return execRun(r, req.turnId, async (ex) => {
        if (due.length > 0) {
          await ex.steps(
            planAlarmNotice(
              snapshot(),
              due.map((t) => t.label),
            ).steps,
          )
        }
        const whole = plan(planReq, snapshot())
        if (!whole.needsBody || bridge.get() || sceneUnavailable()) {
          // With the 3D robot — or against the 2D robot when no 3D body will ever come.
          jokeIndex += whole.jokesUsed
          return ex.steps(whole.steps)
        }
        // The 3D robot is still loading: what needs no body happens now; the motion waits for it,
        // so a second command in the meantime loses nothing that was already asked for.
        const body = waitForController(r.ac.signal)
        const parts = splitForBody(planReq)
        if (parts) await ex.steps(planNow(parts.now).steps)
        await awaitBody(ex, r, body)
        if (r.ac.signal.aborted) return
        // Plan the motion from where the body really is (or without one, after the timeout).
        await ex.steps(planNow(parts ? parts.later : planReq).steps)
      })
    },

    interrupt(): void {
      interrupt()
      startAlarms()
    },

    cancelTimer(id: string): void {
      const t = store().timers.find((x) => x.id === id)
      if (!t) return
      pendingAlarms = pendingAlarms.filter((x) => x.id !== id)
      timers.cancel(id)
      const label = t.label ? { label: t.label } : {}
      if (!t.ringing) {
        // A countdown cancelled from the pill.
        store().announce(reply('timer.cancel', label))
        return
      }
      // A ringing timer: dismissing it silences its alarm (speech, beep, jumps) and the title.
      const cur = current
      if (cur?.kind === 'alarm') {
        // Timers of the same alarm that were not announced yet are still due.
        const shown = cur.handle?.replies.filter((x) => x.key === 'timer.done').length ?? 0
        const ringing = new Set(
          store()
            .timers.filter((x) => x.ringing)
            .map((x) => x.id),
        )
        pendingAlarms = [
          ...(cur.alarms ?? []).slice(shown).filter((x) => ringing.has(x.id)),
          ...pendingAlarms,
        ]
        interrupt()
      }
      refreshAlarmTitle(true)
      const ref = reply('timer.dismissed', label)
      if (current) {
        // A command is running: do not cut it short, just say it to screen readers.
        store().announce(ref)
        return
      }
      const r = begin(null, 'notice')
      void execRun(r, null, (ex) => ex.steps([{ op: 'say', reply: ref, wait: true }]))
    },

    returnHome(): void {
      welcomed = true
      interrupt()
      if (!bridge.get()) return startAlarms()
      const r = begin(null, 'home')
      const steps = planReturnHome(snapshot()).steps
      void execRun(r, null, (ex) => ex.steps(steps))
    },

    dispose(): void {
      if (disposed) return
      interrupt()
      disposed = true
      pendingAlarms = []
      timers.dispose()
      unsubscribeBridge()
      deps.doc?.removeEventListener('visibilitychange', onVisibility)
      clearAlarmTitle()
    },
  }

  constructed = true
  // Timers left in the store by a previous instance (dev HMR) may have expired meanwhile.
  startAlarms()
  // The scene may already be up (dev HMR re-created the engine).
  maybeWelcome()
  return engine
}

/** The production wiring (browser globals, the real stores, speaker, weather service). */
export function defaultDeps(
  base: Pick<
    EngineDeps,
    'store' | 'subscribeStore' | 'prefs' | 'speaker' | 'render' | 'fetchWeather' | 'beep' | 'primeAudio'
  > &
    Partial<EngineDeps>,
): EngineDeps {
  const hasWindow = typeof window !== 'undefined'
  return {
    bridge: controllerBridge,
    now: Date.now,
    matches: (q) => {
      try {
        return hasWindow && typeof window.matchMedia === 'function' && window.matchMedia(q).matches
      } catch {
        return false
      }
    },
    doc: typeof document !== 'undefined' ? document : null,
    readyTimeoutMs: READY_TIMEOUT_MS,
    ...base,
  }
}
