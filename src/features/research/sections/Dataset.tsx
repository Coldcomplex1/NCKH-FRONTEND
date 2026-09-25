import { Cpu, Database, FlaskConical, Info, TextCursorInput, Table2 } from 'lucide-react'
import { DataTable } from '@/components/charts'
import { FactList } from '../components/FactList'
import { Panel, Section, Sticker } from '../components/Section'
import { useResearch } from '../useResearch'

/** Splits table (speakers never summed), training recipe, compute environment and normalization. */
export function Dataset() {
  const { t, f, s } = useResearch()
  const d = t.dataset
  return (
    <Section
      id="dataset"
      title={d.heading}
      intro={d.intro(s, f)}
      icon={<Database className="size-7" />}
      tint="success"
    >
      <Panel>
        <div className="mb-4 flex items-center gap-3">
          <Sticker icon={<Table2 className="size-6" />} tint="primary" />
          <h3 className="m-0 font-display text-xl font-extrabold">{d.splits.title}</h3>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            caption={d.splits.title}
            spec={{
              columns: d.splits.cols,
              rows: s.splits.map((x) => [
                t.common.split[x.name],
                f.int(x.utterances),
                f.num(x.hours),
                f.int(x.speakers),
                f.int(x.over30s),
              ]),
            }}
            footer={[
              d.splits.total,
              f.int(s.splitTotals.utterances),
              f.num(s.splitTotals.hours),
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">{d.splits.notSummed}</span>
              </>,
              f.int(s.splitTotals.over30s),
            ]}
          />
        </div>
        <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-muted">
          <li className="flex gap-2">
            <span aria-hidden="true" className="w-5 shrink-0 text-center font-bold">
              —
            </span>
            <span>{d.splits.notSummed}.</span>
          </li>
          <li className="flex gap-2">
            <Info aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <span>{d.splits.note(s, f)}</span>
          </li>
          <li className="flex gap-2">
            <Info aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <span>{d.splits.trainUsed(s, f)}</span>
          </li>
        </ul>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center gap-3">
            <Sticker icon={<FlaskConical className="size-6" />} tint="accent" />
            <h3 className="m-0 font-display text-xl font-extrabold">{d.recipe.title}</h3>
          </div>
          <FactList items={d.recipe.items.map((it) => ({ label: it.label, value: it.value(s, f) }))} />
        </Panel>
        <div className="grid content-start gap-6">
          <Panel>
            <div className="mb-3 flex items-center gap-3">
              <Sticker icon={<Cpu className="size-6" />} tint="sun" />
              <h3 className="m-0 font-display text-xl font-extrabold">{d.environment.title}</h3>
            </div>
            <FactList items={d.environment.items.map((it) => ({ label: it.label, value: it.value(s, f) }))} />
          </Panel>
          <Normalization />
        </div>
      </div>
    </Section>
  )
}

function Normalization() {
  const { t, s } = useResearch()
  const n = t.dataset.normalization
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-3">
        <Sticker icon={<TextCursorInput className="size-6" />} tint="primary" />
        <h3 className="m-0 font-display text-xl font-extrabold">{n.title}</h3>
      </div>
      <p className="mt-0 mb-4 text-muted">{n.intro}</p>
      <h4 className="m-0 font-sans text-base font-bold">{n.raw}</h4>
      <p className="mt-1 mb-4">{n.rawRule}</p>
      <h4 className="m-0 font-sans text-base font-bold">{n.normalized}</h4>
      <ol className="m-0 mt-1 grid gap-1.5 ps-6">
        {s.normalization.normalized.map((rule) => {
          const r = n.rules[rule.normalize('NFC')] ?? { text: rule }
          return (
            <li key={rule}>
              {r.text}
              {r.sample ? (
                <>
                  {': '}
                  <span lang="vi" className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold">
                    {r.sample}
                  </span>
                </>
              ) : null}
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
