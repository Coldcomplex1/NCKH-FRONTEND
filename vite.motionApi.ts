import type { IncomingMessage } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

/**
 * Dev only: serves /api/motion from src/server/motionHandler.ts inside `npm run dev`, exactly as the
 * Vercel function does in production. It reads server-side variables (DASHSCOPE_API_KEY, QWEN_*)
 * from .env.local / the shell; they are never exposed to the browser (no VITE_ prefix).
 */
export function motionApiDev(): Plugin {
  return {
    name: 'motion-api-dev',
    apply: 'serve',
    configureServer(server) {
      const fileEnv = loadEnv(server.config.mode, server.config.root, '')
      server.middlewares.use('/api/motion', (req, res, next) => {
        void (async () => {
          const mod = (await server.ssrLoadModule(
            '/src/server/motionHandler.ts',
          )) as typeof import('./src/server/motionHandler.js')
          const request = await toRequest(req)
          const response = await mod.handleMotion(request, { env: { ...fileEnv, ...process.env }, fetch })
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })().catch(next)
      })
    },
  }
}

async function toRequest(req: IncomingMessage & { originalUrl?: string }): Promise<Request> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const method = req.method ?? 'GET'
  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = Buffer.concat(chunks)
  }
  const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`
  return new Request(url, { method, headers, body })
}
