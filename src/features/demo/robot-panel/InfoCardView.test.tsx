import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeatherData } from '@/core/weather'
import { useDemo } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { InfoCardView } from './InfoCardView'

function setWide(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: wide && query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

const weather: WeatherData = {
  current: {
    tempC: 31.4,
    feelsLikeC: 35.2,
    humidity: 70,
    windKmh: 12.3,
    precipitationMm: 0,
    code: 2,
    isDay: true,
  },
  daily: [
    { date: '2026-09-24', code: 2, maxC: 33, minC: 25, precipProbability: 40 },
    { date: '2026-09-25', code: 61, maxC: 30.6, minC: 24.2, precipProbability: 80 },
  ],
  fetchedAt: 0,
}

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  useDemo.setState({ card: null, turns: [] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('InfoCardView', () => {
  it('weather card: current conditions and the Open-Meteo attribution link', () => {
    setWide(true)
    useDemo
      .getState()
      .showCard(
        { kind: 'weather', status: 'ok', place: { vi: 'Huế', en: 'Huế' }, dayOffset: 0, data: weather },
        null,
      )
    render(<InfoCardView />)
    const card = screen.getByRole('region', { name: /Thời tiết/ })
    expect(card).toHaveTextContent('Huế · Hôm nay')
    expect(card).toHaveTextContent('31°C')
    expect(card).toHaveTextContent('Cảm giác như35°C')
    expect(card).toHaveTextContent('70%')
    expect(card).toHaveTextContent('12 km/h')
    const link = screen.getByRole('link', { name: /Open-Meteo/ })
    expect(link).toHaveAttribute('href', 'https://open-meteo.com/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('weather card for tomorrow shows the daily high / low', () => {
    setWide(true)
    useDemo
      .getState()
      .showCard(
        { kind: 'weather', status: 'ok', place: { vi: 'Huế', en: 'Huế' }, dayOffset: 1, data: weather },
        null,
      )
    render(<InfoCardView />)
    const card = screen.getByRole('region', { name: /Thời tiết/ })
    expect(card).toHaveTextContent('Ngày mai')
    expect(card).toHaveTextContent('31°C / 24°C')
    expect(card).toHaveTextContent('80%')
  })

  it('date card: weekday, date and lunar line in Vietnam time', () => {
    setWide(true)
    useDemo.getState().showCard({ kind: 'date', iso: '2026-09-24T01:35:00.000Z', dayOffset: 0 }, null)
    render(<InfoCardView />)
    const card = screen.getByRole('region', { name: /Ngày tháng/ })
    expect(card).toHaveTextContent('Thứ Năm')
    expect(card).toHaveTextContent('ngày 24 tháng 9 năm 2026')
    expect(card).toHaveTextContent('Âm lịch: 14/8 năm Bính Ngọ')
  })

  it('desktop: hides when expiresAt passes', () => {
    setWide(true)
    vi.useFakeTimers()
    useDemo.getState().showCard({ kind: 'math', expr: [5, '+', 3], result: 8 }, 8000)
    render(<InfoCardView />)
    expect(screen.getByRole('region')).toHaveTextContent('5 + 3 = 8')
    act(() => {
      vi.advanceTimersByTime(8100)
    })
    expect(useDemo.getState().card).toBeNull()
  })

  it('ui-card-hold-stuck: closing a hovered card with X does not freeze the next card', () => {
    setWide(true)
    vi.useFakeTimers()
    render(<InfoCardView />)
    act(() => {
      useDemo.getState().showCard({ kind: 'time', iso: new Date().toISOString() }, 12_000)
    })
    fireEvent.pointerEnter(screen.getByRole('region'))
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thẻ' }))
    expect(useDemo.getState().card).toBeNull()
    act(() => {
      vi.advanceTimersByTime(2_000)
      useDemo.getState().showCard({ kind: 'date', iso: new Date().toISOString(), dayOffset: 0 }, 10_000)
    })
    act(() => {
      vi.advanceTimersByTime(10_500)
    })
    expect(useDemo.getState().card).toBeNull()
  })

  it('ui-card-hold-stuck: the same with the keyboard (focus the X, activate it)', () => {
    setWide(true)
    vi.useFakeTimers()
    render(<InfoCardView />)
    act(() => {
      useDemo.getState().showCard({ kind: 'time', iso: new Date().toISOString() }, 12_000)
    })
    const close = screen.getByRole('button', { name: 'Đóng thẻ' })
    act(() => close.focus())
    fireEvent.click(close)
    act(() => {
      useDemo.getState().showCard({ kind: 'math', expr: [2, '+', 2], result: 4 }, 8_000)
    })
    act(() => {
      vi.advanceTimersByTime(8_500)
    })
    expect(useDemo.getState().card).toBeNull()
  })

  it('a hovered card is still held past its TTL, and hides shortly after the pointer leaves', () => {
    setWide(true)
    vi.useFakeTimers()
    render(<InfoCardView />)
    act(() => {
      useDemo.getState().showCard({ kind: 'math', expr: [5, '+', 3], result: 8 }, 8_000)
    })
    const card = screen.getByRole('region')
    fireEvent.pointerEnter(card)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(useDemo.getState().card).not.toBeNull()
    fireEvent.pointerLeave(card)
    act(() => {
      vi.advanceTimersByTime(3_100)
    })
    expect(useDemo.getState().card).toBeNull()
  })

  it('mobile: stays past its TTL and goes when the next command starts', () => {
    setWide(false)
    vi.useFakeTimers()
    useDemo.getState().startTurn({ id: 'a', at: Date.now(), source: 'text', heard: '5 cộng 3' })
    useDemo.getState().showCard({ kind: 'math', expr: [5, '+', 3], result: 8 }, 8000)
    render(<InfoCardView />)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(useDemo.getState().card).not.toBeNull()
    act(() => {
      useDemo.getState().startTurn({ id: 'b', at: Date.now(), source: 'text', heard: 'nhảy lên' })
    })
    expect(useDemo.getState().card).toBeNull()
  })
})
