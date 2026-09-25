import type { RobotEngine } from '@/core/engine'
// Named import: only the `summary` key is bundled, not the whole results file (research data is lazy).
import { summary } from '@/content/results.json'
import { renderReply } from '@/replies'
import { fetchWeather } from '@/services/weather'
import { beep, primeBeep, speaker } from '@/speech'
import { demo, useDemo } from '@/store/demoStore'
import { getPrefs } from '@/store/prefsStore'
import { createEngine, defaultDeps, type EngineInstance } from './engine'

export { controllerBridge } from './bridge'
export { createEngine } from './engine'
export type { EngineDeps, EngineInstance } from './engine'
export type { AnimationController } from './types'

interface HotData {
  welcomed?: boolean
}

const hot = import.meta.hot
const hotData = hot?.data as HotData | undefined

const instance: EngineInstance = createEngine(
  defaultDeps({
    store: demo,
    subscribeStore: (cb) => useDemo.subscribe(cb),
    prefs: getPrefs,
    speaker,
    render: renderReply,
    fetchWeather: (place, opts) => fetchWeather(place, opts),
    beep: () => beep(),
    primeAudio: primeBeep,
    projectWer: summary.test.werNormalized,
    welcomed: hotData?.welcomed,
  }),
)

/** The app's robot engine (the only module that speaks, fetches weather and runs timers). */
export const engine: RobotEngine = instance

hot?.dispose((data: HotData) => {
  data.welcomed = instance.welcomed
  instance.dispose()
})
