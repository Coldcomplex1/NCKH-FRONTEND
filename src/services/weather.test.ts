import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceRef } from '@/core/places'
import {
  clearWeatherCache,
  fetchWeather,
  parseWeather,
  WEATHER_CACHE_MS,
  WEATHER_TIMEOUT_MS,
  WeatherError,
  weatherUrl,
} from './weather'

const HUE: PlaceRef = { id: 'hue', name: { vi: 'Huế', en: 'Hue' }, lat: 16.46371, lon: 107.590866 }

const BODY = {
  latitude: 16.5,
  longitude: 107.625,
  timezone: 'Asia/Ho_Chi_Minh',
  current: {
    time: '2026-09-24T10:00',
    interval: 900,
    temperature_2m: 30.4,
    relative_humidity_2m: 74,
    apparent_temperature: 35.1,
    precipitation: 0.2,
    weather_code: 80,
    wind_speed_10m: 11.3,
    is_day: 1,
  },
  daily: {
    time: ['2026-09-24', '2026-09-25', '2026-09-26'],
    weather_code: [80, 3, 95],
    temperature_2m_max: [32.1, 31.4, 29.9],
    temperature_2m_min: [24.8, 25, 24.1],
    precipitation_probability_max: [85, null, 90],
  },
}

const ok = (body: unknown = BODY) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  clearWeatherCache()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('weatherUrl', () => {
  it('asks Open-Meteo for current + 3-day daily in Vietnam time, coords rounded to 2 decimals', () => {
    const url = new URL(weatherUrl(HUE))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    const q = url.searchParams
    expect(q.get('latitude')).toBe('16.46')
    expect(q.get('longitude')).toBe('107.59')
    expect(q.get('current')).toBe(
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    )
    expect(q.get('daily')).toBe(
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    )
    expect(q.get('timezone')).toBe('Asia/Ho_Chi_Minh')
    expect(q.get('forecast_days')).toBe('3')
  })
})

describe('parseWeather', () => {
  it('normalizes the response', () => {
    const d = parseWeather(BODY, 123)
    expect(d.current).toEqual({
      tempC: 30.4,
      feelsLikeC: 35.1,
      humidity: 74,
      windKmh: 11.3,
      precipitationMm: 0.2,
      code: 80,
      isDay: true,
    })
    expect(d.daily).toEqual([
      { date: '2026-09-24', code: 80, maxC: 32.1, minC: 24.8, precipProbability: 85 },
      { date: '2026-09-25', code: 3, maxC: 31.4, minC: 25, precipProbability: null },
      { date: '2026-09-26', code: 95, maxC: 29.9, minC: 24.1, precipProbability: 90 },
    ])
    expect(d.fetchedAt).toBe(123)
  })

  it('rejects malformed bodies as http errors', () => {
    expect(() => parseWeather({}, 0)).toThrow(WeatherError)
    expect(() => parseWeather({ ...BODY, current: { ...BODY.current, temperature_2m: 'hot' } }, 0)).toThrow(
      /temperature_2m/,
    )
    expect(() => parseWeather(null, 0)).toThrow(expect.objectContaining({ kind: 'http' }))
  })
})

describe('fetchWeather', () => {
  it('fetches, parses and caches per place for 10 minutes', async () => {
    let now = 1_000_000
    const fetchImpl = vi.fn(async () => ok())
    const a = await fetchWeather(HUE, { fetchImpl, now: () => now })
    expect(a.current.tempC).toBe(30.4)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('latitude=16.46')

    now += WEATHER_CACHE_MS - 1
    expect(await fetchWeather(HUE, { fetchImpl, now: () => now })).toBe(a)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await fetchWeather({ ...HUE, id: 'hcm' }, { fetchImpl, now: () => now })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    now += 2
    await fetchWeather(HUE, { fetchImpl, now: () => now })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('maps HTTP errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }))
    await expect(fetchWeather(HUE, { fetchImpl })).rejects.toMatchObject({ kind: 'http', status: 503 })
  })

  it('maps network failures to offline', async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(fetchWeather(HUE, { fetchImpl })).rejects.toMatchObject({ kind: 'offline' })
  })

  it('times out after 8 s', async () => {
    vi.useFakeTimers()
    let seen: AbortSignal | undefined
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init?.signal ?? undefined
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const p = fetchWeather(HUE, { fetchImpl }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(WEATHER_TIMEOUT_MS - 1)
    expect(seen?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(await p).toMatchObject({ kind: 'timeout' })
    expect(seen?.aborted).toBe(true)
  })

  it("aborts with the caller's signal (AbortError, not a WeatherError)", async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const p = fetchWeather(HUE, { fetchImpl, signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await expect(p).rejects.not.toBeInstanceOf(WeatherError)
  })

  it('a malformed body is an http error', async () => {
    const fetchImpl = vi.fn(async () => ok({ nope: true }))
    await expect(fetchWeather(HUE, { fetchImpl })).rejects.toMatchObject({ kind: 'http' })
  })
})
