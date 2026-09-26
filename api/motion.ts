import { handleMotion } from '../src/server/motionHandler.js'

/**
 * Vercel Function (Node.js runtime): POST /api/motion asks Qwen to invent a robot move, GET reports
 * whether the feature is on. The only place the Qwen key (DASHSCOPE_API_KEY, a server-side env var,
 * never VITE_) is read. The logic lives in src/server/motionHandler.ts (relative `.js` imports:
 * Vercel does not resolve the `@/` alias and runs the compiled files as ES modules).
 */
export default {
  fetch(request: Request): Promise<Response> {
    return handleMotion(request, { env: process.env, fetch })
  },
}
