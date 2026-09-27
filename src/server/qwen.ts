/**
 * Minimal client for Qwen on Alibaba Cloud Model Studio (DashScope), through its OpenAI-compatible
 * Chat Completions endpoint. Plain fetch, no SDK. Runs only on the server (the Vercel function, or
 * the Vite dev middleware): the API key never reaches the browser.
 *
 * JSON mode (`response_format: json_object`) is used rather than JSON-Schema mode, which Model
 * Studio does not offer for Singapore-region models yet; the caller validates the output itself.
 * Qwen3.x hybrid models think by default: thinking is switched off (faster, and JSON mode is only
 * reliable without it). `thinking: true` streams, because thinking requires a streaming call.
 */

export interface QwenConfig {
  apiKey: string
  /** e.g. https://dashscope-intl.aliyuncs.com/compatible-mode/v1 (or a workspace endpoint). */
  baseUrl: string
  model: string
  thinking: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type QwenErrorKind =
  'timeout' | 'aborted' | 'network' | 'auth' | 'rate_limited' | 'http' | 'bad_response'

export class QwenError extends Error {
  readonly kind: QwenErrorKind
  readonly status: number | undefined

  constructor(kind: QwenErrorKind, status?: number) {
    super(`Qwen ${kind}${status ? ` (HTTP ${status})` : ''}`)
    this.name = 'QwenError'
    this.kind = kind
    this.status = status
  }
}

export interface QwenResult {
  content: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const THINKING_BUDGET = 1500
const MAX_TOKENS = 3000

function errorFor(status: number): QwenError {
  if (status === 401 || status === 403) return new QwenError('auth', status)
  if (status === 429) return new QwenError('rate_limited', status)
  return new QwenError('http', status)
}

/** Reads an SSE stream of chat-completion chunks and joins the answer text (reasoning dropped). */
async function readStream(res: Response): Promise<QwenResult> {
  if (!res.body) throw new QwenError('bad_response')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: QwenResult['usage']
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return { content, usage }
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null } }[]
          usage?: QwenResult['usage']
        }
        content += chunk.choices?.[0]?.delta?.content ?? ''
        if (chunk.usage) usage = chunk.usage
      } catch {
        /* keep-alive or partial line */
      }
    }
  }
  return { content, usage }
}

/** One chat completion. Rejects with a QwenError (never anything else). */
export async function qwenChat(
  cfg: QwenConfig,
  messages: ChatMessage[],
  opts: { fetch: typeof fetch; timeoutMs: number; signal?: AbortSignal; temperature?: number },
): Promise<QwenResult> {
  const ac = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, opts.timeoutMs)
  const onAbort = () => ac.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      response_format: { type: 'json_object' },
      enable_thinking: cfg.thinking,
      temperature: opts.temperature ?? 0.5,
      max_tokens: MAX_TOKENS,
    }
    if (cfg.thinking) {
      body.thinking_budget = THINKING_BUDGET
      body.stream = true
      body.stream_options = { include_usage: true }
    }
    let res: Response
    try {
      res = await opts.fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      })
    } catch {
      throw new QwenError(timedOut ? 'timeout' : opts.signal?.aborted ? 'aborted' : 'network')
    }
    if (!res.ok) throw errorFor(res.status)
    try {
      if (cfg.thinking) return await readStream(res)
      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[]
        usage?: QwenResult['usage']
      }
      const content = json.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new QwenError('bad_response')
      return { content, usage: json.usage }
    } catch (err) {
      if (err instanceof QwenError) throw err
      throw new QwenError(timedOut ? 'timeout' : 'bad_response')
    }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
