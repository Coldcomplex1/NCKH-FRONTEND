import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./loadResearch', () => ({ loadResearch: mocks.load, prefetchResearch: () => {} }))

/** React.lazy caches its first result per module instance, so every test gets fresh modules. */
async function renderPage() {
  const { LazyResearch } = await import('./LazyResearch')
  const { SectionBoundary } = await import('./SectionBoundary')
  const { usePrefs } = await import('@/store/prefsStore')
  usePrefs.setState({ lang: 'vi' })
  return render(
    <>
      <div>demo still here</div>
      <SectionBoundary section="research">
        <LazyResearch />
      </SectionBoundary>
    </>,
  )
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  window.location.hash = ''
})

describe('LazyResearch + SectionBoundary', () => {
  it('survives a malformed deep link such as #%E0%A4%A', async () => {
    mocks.load.mockResolvedValue({ ResearchSection: () => <section id="research">research body</section> })
    window.location.hash = '#%E0%A4%A'
    await renderPage()
    expect(await screen.findByText('research body')).toBeInTheDocument()
    expect(screen.getByText('demo still here')).toBeInTheDocument()
  })

  it('shows a reload message instead of blanking the page when the chunk fails to load', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.load.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'))
    await renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được phần kết quả nghiên cứu')
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mở báo cáo kỹ thuật' })).toHaveAttribute(
      'href',
      '/reports/run-results-dashboard.html',
    )
    expect(screen.getByText('demo still here')).toBeInTheDocument()
    spy.mockRestore()
  })
})
