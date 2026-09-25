import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefs } from '@/store/prefsStore'
import { TextComposer } from './TextComposer'

const mocks = vi.hoisted(() => ({ submitCommand: vi.fn() }))
vi.mock('../pipeline', () => ({ submitCommand: (...args: unknown[]) => mocks.submitCommand(...args) }))

function setup() {
  render(<TextComposer />)
  const box = screen.getByRole('textbox', { name: 'Nhập lệnh cho robot' }) as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 'nhảy ba lần rồi vẫy tay' } })
  return box
}

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  mocks.submitCommand.mockImplementation(async () => ({ status: 'done' }))
})

describe('TextComposer', () => {
  it('is the #command-input textarea (SkipLink target) with maxLength 200 and a counter', () => {
    const box = setup()
    expect(box.id).toBe('command-input')
    expect(box).toHaveAttribute('maxlength', '200')
    expect(box).toHaveAttribute('lang', 'vi')
    expect(screen.getByText('23/200 ký tự')).toBeInTheDocument()
  })

  it('Enter sends the text and clears the box', () => {
    const box = setup()
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' })
    expect(mocks.submitCommand).toHaveBeenCalledTimes(1)
    expect(mocks.submitCommand).toHaveBeenCalledWith('nhảy ba lần rồi vẫy tay', 'text')
    expect(box.value).toBe('')
  })

  it('Shift+Enter does not send (new line)', () => {
    const box = setup()
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', shiftKey: true })
    expect(mocks.submitCommand).not.toHaveBeenCalled()
    expect(box.value).toBe('nhảy ba lần rồi vẫy tay')
  })

  it('Enter during IME composition (Telex/VNI) does not send', () => {
    const box = setup()
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', isComposing: true })
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 229 })
    expect(mocks.submitCommand).not.toHaveBeenCalled()
    expect(box.value).toBe('nhảy ba lần rồi vẫy tay')
  })

  it('does not send empty or whitespace-only text', () => {
    render(<TextComposer />)
    const box = screen.getByRole('textbox')
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(mocks.submitCommand).not.toHaveBeenCalled()
  })

  it('the Gửi button sends', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(mocks.submitCommand).toHaveBeenCalledWith('nhảy ba lần rồi vẫy tay', 'text')
  })

  it('keeps focus for keyboard users (fine pointer) after sending', () => {
    const box = setup()
    box.focus()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(document.activeElement).toBe(box)
  })

  it('English UI: English label, Vietnamese-only hint', () => {
    usePrefs.setState({ lang: 'en' })
    render(<TextComposer />)
    expect(screen.getByRole('textbox', { name: 'Type a command for the robot' })).toBeInTheDocument()
    expect(screen.getByText(/Commands are in Vietnamese/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})
