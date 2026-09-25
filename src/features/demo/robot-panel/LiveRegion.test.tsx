import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { reply } from '@/core/replies'
import { useDemo } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { LiveRegion } from './LiveRegion'

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  useDemo.setState({ live: null })
})

describe('LiveRegion', () => {
  it('announces replies politely, and timer alarms assertively', () => {
    const { container } = render(<LiveRegion />)
    const polite = container.querySelector('[aria-live="polite"]')!
    const assertive = container.querySelector('[aria-live="assertive"]')!
    act(() => useDemo.getState().announce(reply('chat.thanks', {})))
    expect(polite.textContent).toBe('Không có chi! Rất vui được giúp bạn.')
    expect(assertive.textContent).toBe('')
    act(() => useDemo.getState().announce(reply('timer.done', {}), true))
    expect(assertive.textContent).not.toBe('')
    expect(polite.textContent).toBe('')
  })

  it('ui-live-region-lang: switching the language does not re-announce the last reply', () => {
    const { container } = render(<LiveRegion />)
    const polite = container.querySelector('[aria-live="polite"]')!
    act(() => useDemo.getState().announce(reply('chat.thanks', {})))
    const before = polite.textContent
    const node = polite.firstChild
    act(() => usePrefs.setState({ lang: 'en' }))
    // Same node, same text: nothing for a screen reader to read again.
    expect(polite.textContent).toBe(before)
    expect(polite.firstChild).toBe(node)
    // The next reply is announced in the new language.
    act(() => useDemo.getState().announce(reply('chat.thanks', {})))
    expect(polite.textContent).toBe("You're welcome! Happy to help.")
  })
})
