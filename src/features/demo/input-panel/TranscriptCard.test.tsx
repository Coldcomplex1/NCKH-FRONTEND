import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseResult } from '@/core/parser'
import { INITIAL_STAGES, useDemo, type Turn } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { TranscriptCard } from './TranscriptCard'

const mocks = vi.hoisted(() => ({ submitCommand: vi.fn() }))
vi.mock('../pipeline', () => ({ submitCommand: (...args: unknown[]) => mocks.submitCommand(...args) }))

// "chừ mấy giờ rồi rứa" → "bây giờ mấy giờ rồi vậy"
const normalized = 'bây giờ mấy giờ rồi vậy'
const parse: ParseResult = {
  parser: 'rule-v1',
  input: 'chừ mấy giờ rồi rứa?',
  normalizedText: normalized,
  coreText: 'bây giờ mấy giờ',
  inputMode: 'accented',
  substitutions: [
    { from: 'chừ', to: 'bây giờ', start: 0, end: 7, kind: 'dialect', region: ['central'] },
    { from: 'rứa', to: 'vậy', start: 20, end: 23, kind: 'dialect', region: ['central'] },
  ],
  dialectHints: { central: 2 },
  clauses: [{ text: normalized, negated: false, question: true }],
  actions: [{ action: { type: 'time' }, confidence: 0.95, matched: 'mấy giờ', clause: 0, source: 'rule' }],
  unknown: [],
  suggestions: [],
  confidence: 0.95,
  notes: [],
  status: 'ok',
  elapsedMs: 2,
}

function turn(p: Partial<Turn> = {}): Turn {
  return {
    id: 't1',
    at: Date.parse('2026-09-24T08:35:00+07:00'),
    source: 'text',
    heard: 'chừ mấy giờ rồi rứa?',
    parse,
    replies: [],
    status: 'done',
    ...p,
  }
}

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  useDemo.setState({ turns: [], stages: { ...INITIAL_STAGES } })
})

describe('TranscriptCard', () => {
  it('shows an empty state and the pipeline before the first command', () => {
    render(<TranscriptCard />)
    expect(screen.getByRole('heading', { name: 'Robot nghe được' })).toBeInTheDocument()
    expect(screen.getByText(/chưa nhận lệnh nào/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Các bước xử lý' })).toBeInTheDocument()
    expect(screen.getByText('Qwen').closest('li')).toHaveAttribute('data-state', 'soon')
  })

  it('highlights substituted words with <mark> using the char offsets', () => {
    useDemo.setState({ turns: [turn()] })
    render(<TranscriptCard />)
    expect(screen.getByText('“chừ mấy giờ rồi rứa?”')).toBeInTheDocument()
    const p = screen.getByTestId('normalized')
    expect(p).toHaveTextContent(normalized)
    const marks = Array.from(p.querySelectorAll('mark')).map((m) => m.textContent)
    expect(marks).toEqual(['bây giờ', 'vậy'])
  })

  it('lists the dialect words in plain words, with the region, and shows the badge', () => {
    useDemo.setState({ turns: [turn()] })
    render(<TranscriptCard />)
    const list = screen.getAllByText(/Từ địa phương đã nhận ra/)
    // badge + list label
    expect(list.length).toBe(2)
    const item = screen.getByText('chừ').closest('li')!
    expect(item).toHaveTextContent('chừ → nghĩa là bây giờ (miền Trung)')
    expect(screen.getByText('rứa').closest('li')).toHaveTextContent('rứa → nghĩa là vậy (miền Trung)')
    expect(screen.getByText('Đã hiểu')).toBeInTheDocument()
  })

  it('no badge and no dialect list when nothing regional was found', () => {
    useDemo.setState({
      turns: [
        turn({
          heard: 'bat quat len',
          parse: {
            ...parse,
            input: 'bat quat len',
            normalizedText: 'bật quạt lên',
            substitutions: [{ from: 'bat', to: 'bật', start: 0, end: 3, kind: 'spelling' }],
            dialectHints: {},
            actions: [
              {
                action: { type: 'fan', power: 'on' },
                confidence: 0.9,
                matched: 'bật quạt',
                clause: 0,
                source: 'rule',
              },
            ],
          },
        }),
      ],
    })
    render(<TranscriptCard />)
    expect(screen.queryByText(/Từ địa phương đã nhận ra/)).toBeNull()
    expect(screen.getByText('bat').closest('li')).toHaveTextContent(
      'bat → nghĩa là bật (thêm dấu / chính tả)',
    )
    expect(screen.getByText('Quạt')).toBeInTheDocument()
  })

  it('renders intent chips in order with counts', () => {
    useDemo.setState({
      turns: [
        turn({
          heard: 'nhảy ba lần rồi vẫy tay',
          parse: {
            ...parse,
            normalizedText: 'nhảy ba lần rồi vẫy tay',
            substitutions: [],
            dialectHints: {},
            actions: [
              {
                action: { type: 'jump', count: 3 },
                confidence: 1,
                matched: 'nhảy',
                clause: 0,
                source: 'rule',
              },
              {
                action: { type: 'wave', count: 1 },
                confidence: 1,
                matched: 'vẫy tay',
                clause: 1,
                source: 'rule',
              },
            ],
          },
        }),
      ],
    })
    render(<TranscriptCard />)
    const intents = screen.getByText('Nhảy').closest('li')!
    expect(intents).toHaveTextContent('Bước 1:')
    expect(intents).toHaveTextContent('×3')
    expect(screen.getByText('Vẫy tay').closest('li')).toHaveTextContent('Bước 2:')
  })

  it('suggestion chips submit their Vietnamese command', () => {
    useDemo.setState({
      turns: [
        turn({
          heard: 'abc',
          parse: {
            ...parse,
            normalizedText: 'abc',
            substitutions: [],
            dialectHints: {},
            actions: [],
            unknown: [{ text: 'abc', clause: 0, reason: 'no_match' }],
            suggestions: [{ say: 'nhảy lên', label: { vi: 'Nhảy lên', en: 'Jump' } }],
            status: 'unknown',
          },
        }),
      ],
    })
    render(<TranscriptCard />)
    expect(screen.getByText('Chưa hiểu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'nhảy lên' }))
    expect(mocks.submitCommand).toHaveBeenCalledWith('nhảy lên', 'chip')
  })

  it('shows the turn error and both ASR lines when a correction exists', () => {
    useDemo.setState({
      turns: [
        turn({
          source: 'mic',
          heard: 'bật quạt lên coi',
          asr: { raw: 'bat quat len coi', corrected: 'bật quạt lên coi' },
          parse: undefined,
          status: 'error',
          error: 'generic',
        }),
      ],
    })
    render(<TranscriptCard />)
    expect(screen.getByText('“bat quat len coi”')).toBeInTheDocument()
    expect(screen.getByText('“bật quạt lên coi”')).toBeInTheDocument()
    expect(screen.getByText(/Có lỗi xảy ra/)).toBeInTheDocument()
    expect(screen.getByText('Lỗi')).toBeInTheDocument()
  })
})
