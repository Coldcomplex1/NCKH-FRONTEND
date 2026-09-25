import { AsrError, type TranscribeResponse } from './asrClient'

/**
 * DEV-ONLY fake transcriber (VITE_ASR_MOCK=true in `npm run dev`), to exercise the audio UI and the
 * pipeline without a GPU backend. It ignores the audio and cycles through canned transcripts:
 * a standard command, a Central-dialect one, and one carrying a (future) Qwen `corrected_text`.
 * The pipeline only imports it dynamically when `ENV.asr.mock` is true, and it refuses to run in
 * production builds.
 */
const CANNED: TranscribeResponse[] = [
  { text: 'nhảy ba lần rồi vẫy tay', duration: 2.1 },
  { text: 'chừ mấy giờ rồi rứa', duration: 1.8 },
  { text: 'bat quat len coi', corrected_text: 'bật quạt lên coi', duration: 1.6 },
  { text: 'hôm nay thời tiết ở huế thế nào', duration: 2.4 },
  { text: 'mở đèn lên coi', duration: 1.4 },
]

let next = 0

export function mockTranscribe(
  _audio: Blob,
  opts: { signal?: AbortSignal } = {},
): Promise<TranscribeResponse> {
  if (!import.meta.env.DEV) return Promise.reject(new AsrError('disabled'))
  const result = CANNED[next++ % CANNED.length]!
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new AsrError('aborted'))
      return
    }
    const timer = setTimeout(() => {
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ ...result })
    }, 800)
    function onAbort() {
      clearTimeout(timer)
      reject(new AsrError('aborted'))
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
  })
}
