import { useDict } from '@/i18n'
import { shellDict } from '@/i18n/shell'

export function Footer() {
  const t = useDict(shellDict)
  return (
    <footer className="mt-16 border-t-2 border-line bg-surface-2">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p className="m-0">
          <strong className="font-display">{t.footer.team}</strong> · {t.footer.note}
        </p>
        <p className="m-0 flex flex-wrap gap-x-5 gap-y-2">
          <a className="font-semibold text-primary underline underline-offset-4" href="#credits">
            {t.footer.credits}
          </a>
          <a
            className="font-semibold text-primary underline underline-offset-4"
            href="/reports/run-results-dashboard.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.footer.report}
          </a>
        </p>
      </div>
    </footer>
  )
}
