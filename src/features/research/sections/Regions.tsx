import { Map as MapIcon } from 'lucide-react'
import { BarList, ChartFigure } from '@/components/charts'
import { REGIONS, SCALES } from '@/content/stats'
import { FactList } from '../components/FactList'
import { ProvinceRanking } from '../components/ProvinceRanking'
import { RegionShape } from '../components/RegionMark'
import { Panel, Section } from '../components/Section'
import { capFirst, useResearch } from '../useResearch'

/** Region bars, a few facts, and the 63-province ranking with a region filter. */
export function Regions() {
  const { t, f, s, lang } = useResearch()
  const r = t.regions
  const rows = REGIONS.map((region) => s.regions[region])
  return (
    <Section
      id="regions"
      title={r.heading(s, f)}
      intro={r.intro(s, f)}
      icon={<MapIcon className="size-7" />}
      tint="accent"
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <ChartFigure
          title={r.bars.title}
          takeaway={r.bars.takeaway(s, f)}
          footnote={`${t.common.lowerIsBetter}. ${t.common.scale(SCALES.regions, f)}.`}
          table={{
            columns: r.bars.tableCols,
            rows: rows.map((x) => [
              capFirst(t.common.regionLong[x.region], lang),
              f.pct(x.wer),
              f.int(x.utterances),
              f.int(x.provinceCount),
            ]),
          }}
        >
          <BarList
            label={r.bars.title}
            max={SCALES.regions}
            labelWidth="sm:grid-cols-[minmax(9rem,13rem)_1fr]"
            data={rows.map((x) => ({
              key: x.region,
              label: capFirst(t.common.regionLong[x.region], lang),
              marker: <RegionShape region={x.region} size={16} />,
              note: t.common.n(x.utterances, f),
              value: x.wer,
              valueText: f.pct(x.wer),
              tone: x.region === 'North' ? 'north' : x.region === 'Central' ? 'central' : 'south',
            }))}
          />
        </ChartFigure>

        <Panel title={r.facts.title}>
          <FactList items={r.facts.items.map((it) => ({ label: it.label(s, f), value: it.value(s, f) }))} />
        </Panel>
      </div>

      <ProvinceRanking className="mt-6" />
    </Section>
  )
}
