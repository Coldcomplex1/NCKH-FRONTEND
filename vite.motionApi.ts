import type { IncomingMessage } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

type Handler = (
  request: Request,
  deps: { env: Record<string, string | undefined>; fetch: typeof fetch },
) => Promise<Response>

/**
 * Dev only: serves /api/motion and /api/correct from src/server/*Handler.ts inside `npm run dev`,
 * exactly as the Vercel functions do in production. It reads server-side variables
 * (DASHSCOPE_API_KEY, QWEN_*) from .env*.local / the shell; they are never exposed to the browser
 * (no VITE_ prefix).
 */
export function motionApiDev(): Plugin {
  return {
    name: 'motion-api-dev',
    apply: 'serve',
    configureServer(server) {
      const fileEnv = loadEnv(server.config.mode, server.config.root, '')
      const routes: [string, string, (mod: Record<string, unknown>) => Handler][] = [
        ['/api/motion', '/src/server/motionHandler.ts', (m) => m.handleMotion as Handler],
        ['/api/correct', '/src/server/correctHandler.ts', (m) => m.handleCorrect as Handler],
      ]
      for (const [path, file, pick] of routes) {
        server.middlewares.use(path, (req, res, next) => {
          void (async () => {
            const handler = pick(await server.ssrLoadModule(file))
            const request = await toRequest(req)
            const response = await handler(request, { env: { ...fileEnv, ...process.env }, fetch })
            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          })().catch(next)
        })
      }
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
