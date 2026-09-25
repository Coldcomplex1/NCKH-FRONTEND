import { SendHorizontal } from 'lucide-react'
import { useId, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import { Button } from '@/components/ui'
import { LIMITS } from '@/core/actions'
import { useDict, useLang } from '@/i18n'
import { cn } from '@/lib/cn'
import { useIsCoarsePointer, usePrefersReducedMotion } from '@/lib/hooks'
import { demoDict } from '../dict'
import { submitCommand } from '../pipeline'
import { COMMAND_INPUT_ID, ROBOT_PANEL_ID } from '../ids'

/**
 * The text command box. Enter sends, Shift+Enter adds a line. Enter while an IME is composing
 * (Vietnamese Telex/VNI: `isComposing`, or keyCode 229 on older Safari/Android) never sends.
 * On touch devices the keyboard is closed after sending and the robot scrolled into view; keyboard
 * and screen-reader users keep their focus.
 */
export function TextComposer({ inputRef }: { inputRef?: Ref<HTMLTextAreaElement> }) {
  const t = useDict(demoDict).composer
  const lang = useLang()
  const [text, setText] = useState('')
  const coarse = useIsCoarsePointer()
  const reducedMotion = usePrefersReducedMotion()
  const hintId = useId()
  const counterId = useId()
  const max = LIMITS.maxInputChars

  const send = (el: HTMLTextAreaElement | null) => {
    if (!text.trim()) {
      el?.focus()
      return
    }
    // submitCommand primes speech synchronously: keep this call inside the event handler.
    void submitCommand(text, 'text')
    setText('')
    if (coarse) {
      el?.blur()
      document
        .getElementById(ROBOT_PANEL_ID)
        ?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    send(e.currentTarget)
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    send(e.currentTarget.elements.namedItem(COMMAND_INPUT_ID) as HTMLTextAreaElement | null)
  }

  const atLimit = text.length >= max

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={COMMAND_INPUT_ID} className="font-display text-xl font-extrabold text-ink">
        {t.label}
      </label>
      <textarea
        ref={inputRef}
        id={COMMAND_INPUT_ID}
        name={COMMAND_INPUT_ID}
        lang="vi"
        rows={3}
        maxLength={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t.placeholder}
        aria-describedby={`${hintId} ${counterId}`}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        className="min-h-[5.5em] w-full resize-y rounded-lg border-2 border-line-strong bg-surface px-4 py-3 text-xl text-ink placeholder:text-muted focus:border-primary"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 text-sm text-muted">
          <p id={hintId}>
            {t.hint}
            {lang === 'en' && t.vietnameseOnly ? (
              <>
                <br />
                {t.vietnameseOnly}
              </>
            ) : null}
          </p>
          <p id={counterId} className={cn('tabular-nums', atLimit && 'font-bold text-danger')}>
            {t.counter(text.length, max)}
          </p>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="min-h-13 min-w-32 text-xl"
          icon={<SendHorizontal className="size-6" />}
        >
          {t.send}
        </Button>
      </div>
    </form>
  )
}
