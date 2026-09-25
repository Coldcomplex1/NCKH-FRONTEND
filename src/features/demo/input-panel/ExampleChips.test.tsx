import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefs } from '@/store/prefsStore'
import { ExampleChips } from './ExampleChips'
import { ALL_EXAMPLES, EXAMPLE_GROUPS } from './examples'

const mocks = vi.hoisted(() => ({ submitCommand: vi.fn() }))
vi.mock('../pipeline', () => ({ submitCommand: (...args: unknown[]) => mocks.submitCommand(...args) }))

/** The chip table of the build brief, verbatim. The NLU tests parse exactly these strings. */
const BRIEF_CHIPS: Record<string, string[]> = {
  motion: [
    'nhảy lên',
    'nhảy ba lần rồi vẫy tay',
    'nhảy múa đi',
    'quay một vòng',
    'ngồi xuống',
    'đi sang trái',
  ],
  info: [
    'mấy giờ rồi?',
    'hôm nay thứ mấy?',
    'hôm nay âm lịch ngày mấy?',
    'hẹn giờ 1 phút',
    'thời tiết ở Huế thế nào?',
  ],
  chat: ['xin chào', 'bạn là ai?', 'bạn làm được gì?', 'kể chuyện cười đi', '5 cộng 3 bằng mấy?'],
  home: ['bật đèn', 'đổi đèn sang màu xanh dương', 'bật quạt số 3', 'tắt đèn'],
  dialect: [
    'chừ mấy giờ rồi rứa?',
    'mở đèn lên coi',
    'bựa ni thứ mấy?',
    'mi làm được chi?',
    'quẹo trái',
    'bat quat len',
  ],
  limit: ['ăn một quả chuối'],
}

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  mocks.submitCommand.mockImplementation(async () => ({ status: 'done' }))
})

describe('ExampleChips', () => {
  it('the example data matches the brief chip table exactly', () => {
    expect(Object.fromEntries(EXAMPLE_GROUPS.map((g) => [g.category, g.chips.map((c) => c.vi)]))).toEqual(
      BRIEF_CHIPS,
    )
  })

  it('renders every brief chip under its category heading', () => {
    render(<ExampleChips />)
    expect(screen.getByRole('heading', { name: 'Gợi ý lệnh' })).toBeInTheDocument()
    const headings: Record<string, string> = {
      motion: 'Cử động',
      info: 'Thông tin',
      chat: 'Trò chuyện',
      home: 'Nhà thông minh',
      dialect: 'Giọng miền',
      limit: 'Thử giới hạn',
    }
    for (const [category, chips] of Object.entries(BRIEF_CHIPS)) {
      const group = screen.getByRole('group', { name: headings[category] })
      for (const text of chips) {
        expect(within(group).getByText(text, { exact: true })).toBeInTheDocument()
      }
    }
    expect(screen.getAllByRole('button')).toHaveLength(ALL_EXAMPLES.length)
  })

  it('a click sends that exact command with source "chip"', () => {
    render(<ExampleChips />)
    for (const text of ALL_EXAMPLES) {
      fireEvent.click(screen.getByText(text, { exact: true }).closest('button')!)
    }
    expect(mocks.submitCommand.mock.calls).toEqual(ALL_EXAMPLES.map((text) => [text, 'chip']))
  })

  it('dialect chips show their region tag', () => {
    render(<ExampleChips />)
    const chip = screen.getByText('chừ mấy giờ rồi rứa?').closest('button')!
    expect(chip).toHaveTextContent('miền Trung')
    expect(screen.getByText('bat quat len').closest('button')).toHaveTextContent('không dấu')
  })

  it('English UI keeps the Vietnamese command (lang="vi") and adds a gloss', () => {
    usePrefs.setState({ lang: 'en' })
    render(<ExampleChips />)
    const cmd = screen.getByText('nhảy ba lần rồi vẫy tay')
    expect(cmd).toHaveAttribute('lang', 'vi')
    expect(cmd.closest('button')).toHaveTextContent('jump three times, then wave')
    expect(screen.getByRole('group', { name: 'Regional speech' })).toBeInTheDocument()
  })
})
