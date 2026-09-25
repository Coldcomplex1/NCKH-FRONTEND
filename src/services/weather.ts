import type { PlaceRef } from '@/core/places'
import type { WeatherData, WeatherDay } from '@/core/weather'

/**
 * Open-Meteo client (free, no key, CORS-enabled). The engine calls `fetchWeather(place, { signal })`
 * for "thời tiết ở Huế thế nào?". The UI shows the required "Weather data by Open-Meteo.com" link.
 *
 * - 8 s timeout, chained to the caller's signal (an interrupt aborts the request);
 * - 10-minute in-memory cache per place id;
 * - typed errors: offline | timeout | http (a malformed body counts as 'http').
 */

export const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
export const WEATHER_TIMEOUT_MS = 8_000
export const WEATHER_CACHE_MS = 10 * 60_000

export type WeatherErrorKind = 'offline' | 'timeout' | 'http'

export class WeatherError extends Error {
  readonly kind: WeatherErrorKind
  readonly status: number | undefined

  constructor(kind: WeatherErrorKind, message?: string, status?: number) {
    super(message ?? `weather: ${kind}`)
    this.name = 'WeatherError'
    this.kind = kind
    this.status = status
  }
}

export const isWeatherError = (e: unknown): e is WeatherError => e instanceof WeatherError

const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'is_day',
].join(',')
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
].join(',')

/** Two decimals ≈ 1 km: plenty for a city forecast, and friendlier to the API's cache. */
const coord = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

export function weatherUrl(place: Pick<PlaceRef, 'lat' | 'lon'>): string {
  const q = new URLSearchParams({
    latitude: coord(place.lat),
    longitude: coord(place.lon),
    current: CURRENT,
    daily: DAILY,
    timezone: 'Asia/Ho_Chi_Minh',
    forecast_days: '3',
  })
  // Keep the commas readable (Open-Meteo accepts both forms).
  return `${WEATHER_ENDPOINT}?${q.toString().replaceAll('%2C', ',').replaceAll('%2F', '/')}`
}

const bad = (what: string) => new WeatherError('http', `weather: malformed response (${what})`)

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(what)
  return v
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw bad(what)
  return v
}

/** Normalizes an Open-Meteo `/v1/forecast` body into the core `WeatherData`. Throws WeatherError('http'). */
export function parseWeather(body: unknown, fetchedAt: number): WeatherData {
  if (!body || typeof body !== 'object') throw bad('body')
  const { current, daily } = body as { current?: Record<string, unknown>; daily?: Record<string, unknown> }
  if (!current || typeof current !== 'object') throw bad('current')
  if (!daily || typeof daily !== 'object') throw bad('daily')

  const times = arr(daily.time, 'daily.time')
  const codes = arr(daily.weather_code, 'daily.weather_code')
  const maxs = arr(daily.temperature_2m_max, 'daily.temperature_2m_max')
  const mins = arr(daily.temperature_2m_min, 'daily.temperature_2m_min')
  const probs = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : []

  const days: WeatherDay[] = []
  for (let i = 0; i < Math.min(3, times.length); i++) {
    const date = times[i]
    if (typeof date !== 'string') throw bad('daily.time[i]')
    days.push({
      date,
      code: num(codes[i], 'daily.weather_code[i]'),
      maxC: num(maxs[i], 'daily.temperature_2m_max[i]'),
      minC: num(mins[i], 'daily.temperature_2m_min[i]'),
      precipProbability: numOrNull(probs[i]),
    })
  }
  if (days.length === 0) throw bad('daily is empty')

  return {
    current: {
      tempC: num(current.temperature_2m, 'temperature_2m'),
      feelsLikeC: numOrNull(current.apparent_temperature) ?? num(current.temperature_2m, 'temperature_2m'),
      humidity: numOrNull(current.relative_humidity_2m) ?? 0,
      windKmh: numOrNull(current.wind_speed_10m) ?? 0,
      precipitationMm: numOrNull(current.precipitation) ?? 0,
      code: num(current.weather_code, 'weather_code'),
      isDay: current.is_day === undefined ? true : current.is_day === 1 || current.is_day === true,
    },
    daily: days,
    fetchedAt,
  }
}

const cache = new Map<string, { at: number; data: WeatherData }>()

/** Test helper. */
export function clearWeatherCache(): void {
  cache.clear()
}

export interface FetchWeatherOptions {
  signal?: AbortSignal
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError')
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

/**
 * Current weather + 3-day forecast for a place. Rejects with WeatherError (offline/timeout/http), or
 * with an AbortError when the caller's signal aborts.
 */
export async function fetchWeather(place: PlaceRef, opts: FetchWeatherOptions = {}): Promise<WeatherData> {
  const now = opts.now ?? Date.now
  const { signal } = opts
  if (signal?.aborted) throw abortError()

  const hit = cache.get(place.id)
  if (hit && now() - hit.at < WEATHER_CACHE_MS) return hit.data

  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new WeatherError('offline')
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
  if (!doFetch) throw new WeatherError('offline', 'weather: fetch is not available')

  // One controller for both the timeout and the caller's signal (no AbortSignal.any: older Safari).
  const ac = new AbortController()
  let timedOut = false
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, opts.timeoutMs ?? WEATHER_TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await doFetch(weatherUrl(place), { signal: ac.signal, headers: { Accept: 'application/json' } })
    } catch (e) {
      if (signal?.aborted) throw abortError()
      if (timedOut) throw new WeatherError('timeout')
      throw new WeatherError('offline', e instanceof Error ? e.message : undefined)
    }
    if (!res.ok) throw new WeatherError('http', `weather: HTTP ${res.status}`, res.status)
    let body: unknown
    try {
      body = await res.json()
    } catch {
      if (signal?.aborted) throw abortError()
      if (timedOut) throw new WeatherError('timeout')
      throw bad('json')
    }
    const data = parseWeather(body, now())
    cache.set(place.id, { at: now(), data })
    return data
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
