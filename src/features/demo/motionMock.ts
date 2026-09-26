import { MOCK_MOVES } from '@/motion/referenceMoves'
import type { Escalation, MoveResult } from './escalate'

/**
 * DEV-ONLY stand-in for Qwen (VITE_MOTION_MOCK=true in `npm run dev`): the hand-authored moves in
 * src/motion/referenceMoves.ts for a few keywords (moonwalk, backflip, lộn nhào, nháy/nhắm một mắt), "not
 * a move" for everything else, after a short "thinking" pause. Loaded only through a dynamic import
 * guarded by `import.meta.env.DEV`, so production builds contain none of it.
 */

const strip = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export function mockMove(e: Escalation, signal?: AbortSignal): Promise<MoveResult> {
  const text = strip(e.text)
  const hit = MOCK_MOVES.find((m) => m.words.some((w) => text.includes(w)))
  const result: MoveResult = hit ? { kind: 'move', move: hit.move } : { kind: 'not_motion' }
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ kind: 'error', reason: 'aborted' })
    const t = setTimeout(() => resolve(result), 1500)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        resolve({ kind: 'error', reason: 'aborted' })
      },
      { once: true },
    )
  })
}
