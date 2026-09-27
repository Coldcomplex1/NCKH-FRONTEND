import { handleCorrect } from '../src/server/correctHandler.js'

/**
 * Vercel Function (Node.js runtime): POST /api/correct asks Qwen to post-correct one command (an ASR
 * transcript, or typed text without / with wrong diacritics); GET reports whether the step is on.
 * Uses the same server-side DASHSCOPE_API_KEY as api/motion.ts. Logic: src/server/correctHandler.ts.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return handleCorrect(request, { env: process.env, fetch })
  },
}
