import { Scale } from 'lucide-react'
import { credits, REPORT_URL, type CreditEntry } from '@/content/credits'
import { Disclosure } from '@/components/ui'
import { ExtLink, LinkButton } from '../components/Links'
import { Section } from '../components/Section'
import { useResearch } from '../useResearch'

/** Third-party works and their licences (from content/credits.ts), the non-commercial note, the report. */
export function Credits() {
  const { t } = useResearch()
  const c = t.credits
  return (
    <Section
      id="credits"
      title={c.heading}
      intro={c.intro}
      icon={<Scale className="size-7" />}
      tint="primary"
    >
      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
        {credits.map((entry) => (
          <CreditCard key={entry.id} entry={entry} />
        ))}
      </ul>
      <p className="mt-8 mb-4 max-w-3xl rounded-lg border-2 border-line bg-surface-2 p-4">
        {c.nonCommercial}
      </p>
      <LinkButton href={REPORT_URL} external newTabText={t.common.newTab}>
        {c.report}
      </LinkButton>
    </Section>
  )
}

function CreditCard({ entry }: { entry: CreditEntry }) {
  const { t, lang } = useResearch()
  const c = t.credits
  const name = typeof entry.name === 'string' ? entry.name : entry.name[lang]
  return (
    <li className="flex flex-col rounded-lg border-2 border-line bg-surface p-5 shadow-soft">
      <h3 className="m-0 font-display text-lg font-extrabold break-words">{name}</h3>
      <p className="mt-1 mb-0 text-muted">{entry.role[lang]}</p>
      <p className="mt-2 mb-0" lang={entry.byLang && lang !== entry.byLang ? entry.byLang : undefined}>
        {entry.by[lang]}
      </p>
      {entry.note ? <p className="mt-2 mb-0 text-sm text-muted">{entry.note[lang]}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-5 pt-2">
        {entry.licence ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-muted">{c.licence}:</span>
            <ExtLink href={entry.licence.url} newTabText={t.common.newTab}>
              {entry.licence.name}
            </ExtLink>
          </span>
        ) : (
          <span className="inline-flex min-h-11 items-center text-muted">
            {entry.licenceNote ? entry.licenceNote[lang] : c.noLicence}
          </span>
        )}
        {entry.url ? (
          <ExtLink href={entry.url} newTabText={t.common.newTab}>
            {entry.linkText ?? c.source}
          </ExtLink>
        ) : null}
      </div>
      {entry.citation ? (
        <Disclosure
          className="mt-1"
          summary={
            <>
              {c.cite}
              <span className="sr-only">: {name}</span>
            </>
          }
        >
          <p className="m-0 rounded-md bg-surface-2 p-3 text-sm break-words">{entry.citation}</p>
        </Disclosure>
      ) : null}
    </li>
  )
}
