import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useDict } from '@/i18n'
import { shellDict } from '@/i18n/shell'

interface Props {
  /** Which part of the page failed, for the message and the console. */
  section: 'demo' | 'research'
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Keeps one broken section (a render error, or a lazy chunk that failed to download on a flaky
 * connection) from unmounting the whole page: the rest stays usable and this part offers a reload.
 */
export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[app] the ${this.props.section} section failed to render.`, error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.failed ? <SectionError section={this.props.section} /> : this.props.children
  }
}

function SectionError({ section }: { section: Props['section'] }) {
  const t = useDict(shellDict).error
  return (
    <section
      id={section}
      role="alert"
      className="mx-auto my-8 max-w-3xl rounded-2xl border-2 border-line-strong bg-surface p-6 text-ink"
    >
      <h2 className="text-xl font-bold">{t.title[section]}</h2>
      <p className="mt-2 text-muted">{t.body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover"
        >
          {t.reload}
        </button>
        {section === 'research' && (
          <a
            href="/reports/run-results-dashboard.html"
            className="inline-flex min-h-12 items-center rounded-xl border-2 border-line-strong px-5 font-semibold text-ink hover:bg-surface-2"
          >
            {t.report}
          </a>
        )}
      </div>
    </section>
  )
}
