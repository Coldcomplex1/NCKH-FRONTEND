import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { project } from '@/content/project'
import { usePrefs } from '@/store/prefsStore'
import { ResearchSection } from './ResearchSection'

const IDS = [
  'overview',
  'problem',
  'pipeline',
  'results',
  'quality',
  'regions',
  'errors',
  'dataset',
  'team',
  'credits',
]

function renderIn(lang: 'vi' | 'en') {
  act(() => usePrefs.setState({ lang }))
  return render(<ResearchSection />)
}

afterEach(() => act(() => usePrefs.setState({ lang: 'vi' })))

describe('ResearchSection', () => {
  it.each(['vi', 'en'] as const)('renders every sub-section in order, each with one h2 (%s)', (lang) => {
    const { container } = renderIn(lang)
    const root = container.querySelector('section#research')!
    expect(root).toBeInTheDocument()
    const ids = [...root.querySelectorAll(':scope > section[id]')].map((s) => s.id)
    expect(ids).toEqual(IDS)
    for (const id of IDS) {
      const sec = root.querySelector(`#${id}`)!
      expect(sec.querySelectorAll('h2')).toHaveLength(1)
      expect(sec.getAttribute('aria-labelledby')).toBe(`${id}-title`)
    }
    expect(within(root.querySelector('#overview')!).getByRole('heading', { level: 2 })).toHaveTextContent(
      project.title[lang],
    )
  })

  it('shows the headline test WER with Vietnamese number formatting', () => {
    renderIn('vi')
    const results = document.getElementById('results')!
    expect(within(results).getByText((t) => t.replace(/\s/g, '') === '7,84%')).toBeInTheDocument()
    expect(within(results).getAllByText('Thấp hơn là tốt hơn')).toHaveLength(2)
  })

  it('shows the headline test WER with English number formatting', () => {
    renderIn('en')
    const results = document.getElementById('results')!
    expect(within(results).getByText('7.84%')).toBeInTheDocument()
    expect(
      within(results).getByText((_, el) => el?.tagName === 'DD' && el.textContent === '2,026 utterances'),
    ).toBeInTheDocument()
  })

  it('links the hero buttons to the demo, the results and the full report', () => {
    renderIn('vi')
    expect(screen.getByRole('link', { name: 'Thử robot' })).toHaveAttribute('href', '#demo')
    expect(screen.getByRole('link', { name: 'Xem kết quả' })).toHaveAttribute('href', '#results')
    const report = screen.getAllByRole('link', { name: /Báo cáo kỹ thuật đầy đủ \(tiếng Anh\)/ })[0]!
    expect(report).toHaveAttribute('href', '/reports/run-results-dashboard.html')
    expect(report).toHaveAttribute('target', '_blank')
    expect(report.getAttribute('rel')).toContain('noopener')
  })

  it('does not render a members grid while project.members is empty', () => {
    expect(project.members).toHaveLength(0)
    renderIn('vi')
    const team = document.getElementById('team')!
    expect(within(team).queryByText('Thành viên')).toBeNull()
    expect(within(team).queryAllByRole('list')).toHaveLength(0)
  })

  it('hides the comparison block while no comparison was measured', () => {
    renderIn('vi')
    expect(screen.queryByText('So sánh trên cùng tập kiểm tra')).toBeNull()
  })

  it('filters the province ranking by region and announces it', () => {
    renderIn('vi')
    const regions = document.getElementById('regions')!
    const list = () => regions.querySelector('ol')!
    expect(list().querySelectorAll(':scope > li')).toHaveLength(63)
    fireEvent.click(within(regions).getByRole('button', { name: 'Trung' }))
    expect(list().querySelectorAll(':scope > li')).toHaveLength(19)
    expect(within(regions).getByText('Đang hiện 19 tỉnh thành miền Trung.')).toBeInTheDocument()
    expect(within(list()).getByText(/^Hạng 63\. Quảng Bình — miền Trung — WER 18,50/)).toBeInTheDocument()
  })

  it('labels the Qwen step as coming soon and the training curve as greedy', () => {
    renderIn('en')
    const pipeline = document.getElementById('pipeline')!
    expect(within(pipeline).getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /greedy decoding/ })).toBeInTheDocument()
    expect(screen.getByText(/no sign of overfitting to the validation set/)).toBeInTheDocument()
  })

  it('credits Open-Meteo with the exact attribution text', () => {
    renderIn('en')
    expect(screen.getByRole('link', { name: /Weather data by Open-Meteo\.com/ })).toHaveAttribute(
      'href',
      'https://open-meteo.com/',
    )
  })
})
