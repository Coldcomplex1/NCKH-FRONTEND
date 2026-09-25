import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefs } from '@/store/prefsStore'
import { AudioTab } from './AudioTab'

vi.mock('../pipeline', () => ({ submitAudio: vi.fn(async () => ({ status: 'done' })) }))

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
})

describe('AudioTab', () => {
  it('disabled: shows the coming-soon overlay and makes the whole audio UI inert', () => {
    const onSwitch = vi.fn()
    render(<AudioTab live={false} onSwitchToText={onSwitch} />)

    const overlay = screen.getByTestId('audio-coming-soon')
    expect(overlay).toHaveTextContent('Sắp có')
    expect(overlay).toHaveTextContent('PhoWhisper-large tinh chỉnh trên ViMD')

    const inertBox = screen.getByTestId('audio-inert')
    expect(inertBox).toHaveAttribute('inert')
    // The real controls are rendered (built, not stubbed) …
    const inner = inertBox.querySelectorAll('button, input, [tabindex]')
    expect(inner.length).toBeGreaterThan(0)
    // … and every one of them is inside the inert subtree (not focusable, hidden from AT).
    for (const el of inner) expect(el.closest('[inert]')).toBe(inertBox)
    // Only the overlay's button is reachable.
    const reachable = screen.getAllByRole('button').filter((b) => !b.closest('[inert]'))
    expect(reachable.map((b) => b.textContent)).toEqual(['Chuyển sang Văn bản'])

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang Văn bản' }))
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })

  it('live: no overlay, the microphone button and file picker are usable', () => {
    render(<AudioTab live onSwitchToText={() => {}} />)
    expect(screen.queryByTestId('audio-coming-soon')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nhấn để nói' }).closest('[inert]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Chọn tệp' })).toBeInTheDocument()
    expect(screen.getByText(/tối đa 30 giây · 10 MB/)).toBeInTheDocument()
  })

  it('rejects a file that is not audio', async () => {
    render(<AudioTab live onSwitchToText={() => {}} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/không phải định dạng âm thanh/)).toBeInTheDocument()
  })
})
