import { useDict } from '@/i18n'
import { shellDict } from '@/i18n/shell'

/** First focusable element: jumps to the command composer (id="command-input"). */
export function SkipLink() {
  const t = useDict(shellDict)
  return (
    <a
      href="#command-input"
      className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-md bg-primary px-4 py-3 font-bold text-on-primary"
    >
      {t.skipToComposer}
    </a>
  )
}
