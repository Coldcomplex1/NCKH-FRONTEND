import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LIGHT_COLORS } from '@/core/colors'
import { reply } from '@/core/replies'
import { INITIAL_STAGES, useDemo } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { DemoSection } from './DemoSection'

// Never render R3F in jsdom.
vi.mock('@/robot/RobotStage', () => ({ default: () => <div data-testid="robot-stage" /> }))

const mocks = vi.hoisted(() => ({ cancelTimer: vi.fn() }))
vi.mock('@/engine', () => ({
  engine: {
    submit: async () => ({ status: 'done', replies: [] }),
    interrupt: () => {},
    cancelTimer: (id: string) => mocks.cancelTimer(id),
    returnHome: () => {},
  },
}))

beforeEach(() => {
  usePrefs.setState({ lang: 'vi', muted: false })
  useDemo.setState({
    turns: [],
    stages: { ...INITIAL_STAGES },
    bubble: null,
    card: null,
    timers: [],
    live: null,
    room: { light: { on: false, color: 'warm', dimmed: false }, fan: { on: false, speed: 2 } },
  })
})

describe('DemoSection', () => {
  it('renders the hidden h1, the lazy robot stage, both panels and the command input', async () => {
    render(<DemoSection />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Robot hiểu giọng miền')
    expect(await screen.findByTestId('robot-stage')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Robot Ronaldo/ })).toBeInTheDocument()
    expect(document.getElementById('command-input')).not.toBeNull()
    expect(screen.getByRole('tab', { name: /Văn bản/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('list', { name: 'Trạng thái căn phòng' })).toHaveTextContent('Đèn: tắt')
  })

  it('tabs: arrow keys move to the voice tab (coming soon) and the overlay button returns to text', async () => {
    render(<DemoSection />)
    const textTab = screen.getByRole('tab', { name: /Văn bản/ })
    textTab.focus()
    fireEvent.keyDown(textTab, { key: 'ArrowRight' })
    const voiceTab = screen.getByRole('tab', { name: /Giọng nói/ })
    expect(voiceTab).toHaveAttribute('aria-selected', 'true')
    expect(voiceTab).toHaveTextContent('Sắp có')
    expect(document.activeElement).toBe(voiceTab)
    // The audio UI is a lazy chunk: it appears once loaded.
    expect(await screen.findByTestId('audio-coming-soon')).toBeInTheDocument()
    // The text panel stays mounted (hidden) so the SkipLink target exists.
    expect(document.getElementById('command-input')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang Văn bản' }))
    expect(screen.getByRole('tab', { name: /Văn bản/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('audio-coming-soon')).toBeNull()
  })

  it('the SkipLink (#command-input) brings the text tab back', () => {
    render(
      <>
        <a href="#command-input">skip</a>
        <DemoSection />
      </>,
    )
    fireEvent.click(screen.getByRole('tab', { name: /Giọng nói/ }))
    expect(screen.getByRole('tab', { name: /Giọng nói/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByText('skip'))
    expect(screen.getByRole('tab', { name: /Văn bản/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('overlays follow the store: room chips, timer pill with a cancel button, info card', async () => {
    render(<DemoSection />)
    act(() => {
      useDemo.getState().patchRoom({ light: { on: true, color: 'blue' }, fan: { on: true, speed: 3 } })
      useDemo.getState().addTimer({ id: 'x1', durationMs: 60_000, endsAt: Date.now() + 60_000 })
      useDemo.getState().showCard({ kind: 'math', expr: [5, '+', 3], result: 8 }, null)
      useDemo.getState().setBubble(reply('info.math', { expr: [5, '+', 3], result: 8 }))
    })
    const room = screen.getByRole('list', { name: 'Trạng thái căn phòng' })
    expect(room).toHaveTextContent('Đèn: bật')
    expect(room).toHaveTextContent(LIGHT_COLORS.blue.name.vi)
    expect(room).toHaveTextContent('Quạt: bật · số 3')

    const cancel = screen.getByRole('button', { name: /Hủy hẹn giờ/ })
    fireEvent.click(cancel)
    expect(mocks.cancelTimer).toHaveBeenCalledWith('x1')

    expect(screen.getByRole('region', { name: /Thẻ thông tin/ })).toHaveTextContent('5 + 3 = 8')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thẻ' }))
    expect(useDemo.getState().card).toBeNull()
  })
})
