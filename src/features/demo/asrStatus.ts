import { checkHealth, type AsrHealth, type HealthOptions } from '@/audio/asrClient'
import { ENV } from '@/lib/env'
import { demo } from '@/store/demoStore'

/**
 * Is the ASR backend reachable right now? The model runs on the team's GPU machine (exposed through
 * a tunnel), which is not always on, so the Voice tab says "tạm nghỉ" instead of letting people
 * record into the void.
 *
 * - One GET {VITE_ASR_URL}/health on page load (`prefetchAsrStatus`), then again whenever the Voice
 *   tab asks (`refreshAsrStatus`: the "Thử lại" button, polling while offline/loading, a failed
 *   upload). Calls made while a check is in flight share it.
 * - Only with a real backend (ENV.asr.enabled); the dev mock and the disabled tab never check.
 */

let inflight: Promise<AsrHealth> | null = null

/** Check now (or join the check in flight) and store the result. `opts` is for tests. */
export function refreshAsrStatus(opts: HealthOptions = {}): Promise<AsrHealth> {
  inflight ??= checkHealth(opts)
    .then((state) => {
      demo().setAsr(state)
      return state
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Called once on app start, like prefetchMotionAi(). */
export function prefetchAsrStatus(): void {
  if (ENV.asr.enabled) void refreshAsrStatus()
}
