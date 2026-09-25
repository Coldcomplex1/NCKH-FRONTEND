import {
  Ban,
  Check,
  CircleAlert,
  CircleHelp,
  CircleStop,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Chip } from '@/components/ui'
import type { DialectRegion, ParseResult, Substitution } from '@/core/parser'
import { useDict, useLang } from '@/i18n'
import { cn } from '@/lib/cn'
import { renderReply } from '@/replies'
import { useDemo, type Turn } from '@/store/demoStore'
import { demoDict, type DemoDict, type TranscriptStatus } from '../dict'
import { submitCommand } from '../pipeline'
import { errorRef } from '../turnErrors'
import { highlightSegments, uniqueSubstitutions } from './highlight'
import { SOURCE_ICONS, transcriptStatus } from './turnView'
import { IntentChips } from './IntentChips'
import { PipelineIndicator } from './PipelineIndicator'

const STATUS_STYLE: Record<TranscriptStatus, { icon: LucideIcon; cls: string; spin?: boolean }> = {
  hearing: { icon: LoaderCircle, cls: 'border-primary bg-primary-soft', spin: true },
  thinking: { icon: LoaderCircle, cls: 'border-primary bg-primary-soft', spin: true },
  ok: { icon: Check, cls: 'border-success bg-success-soft' },
  partial: { icon: TriangleAlert, cls: 'border-warning bg-sun-soft' },
  impossible: { icon: Ban, cls: 'border-cat-limit bg-cat-limit-soft' },
  unknown: { icon: CircleHelp, cls: 'border-line-strong bg-surface-2' },
  error: { icon: CircleAlert, cls: 'border-danger bg-danger-soft' },
  interrupted: { icon: CircleStop, cls: 'border-line-strong bg-surface-2' },
}

/** "What the robot heard": the latest turn, its normalized text with highlights, intents and replies. */
export function TranscriptCard() {
  const turn = useDemo((s) => s.turns[0])
  const asrStage = useDemo((s) => s.stages.asr)
  const t = useDict(demoDict)

  return (
    <section
      aria-labelledby="transcript-title"
      className="rounded-xl border-2 border-ink bg-surface p-4 text-ink shadow-pop sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="transcript-title" className="font-display text-2xl font-extrabold">
          {t.transcript.title}
        </h2>
        {turn ? <StatusPill status={transcriptStatus(turn, asrStage)} /> : null}
      </div>
      <div className="mt-3">
        <PipelineIndicator />
      </div>
      {turn ? (
        <TurnBody key={turn.id} turn={turn} hearing={transcriptStatus(turn, asrStage) === 'hearing'} />
      ) : (
        <p className="mt-4 text-base text-muted">{t.transcript.empty}</p>
      )}
    </section>
  )
}

function StatusPill({ status }: { status: TranscriptStatus }) {
  const t = useDict(demoDict).transcript
  const st = STATUS_STYLE[status]
  const Icon = st.icon
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 text-base font-bold text-ink',
        st.cls,
      )}
    >
      <Icon aria-hidden="true" className={cn('size-5', st.spin && 'animate-spin')} />
      <span className="sr-only">{t.statusLabel}: </span>
      {t.status[status]}
    </span>
  )
}

function TurnBody({ turn, hearing }: { turn: Turn; hearing: boolean }) {
  const lang = useLang()
  const t = useDict(demoDict)
  const tt = t.transcript
  const SourceIcon = SOURCE_ICONS[turn.source]
  const parse = turn.parse

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <SourceIcon aria-hidden="true" className="size-5" />
          <span>
            {tt.sourceLabel}: {tt.sources[turn.source]}
          </span>
        </p>
        {hearing && !turn.heard ? (
          <p className="mt-2 flex items-center gap-2 text-lg text-ink">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary" />
            {tt.hearing}
          </p>
        ) : turn.asr?.corrected ? (
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="text-sm text-muted">{tt.asrLine}</dt>
              <dd lang="vi" className="text-lg text-ink">
                “{turn.asr.raw}”
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{tt.qwenLine}</dt>
              <dd lang="vi" className="font-display text-2xl font-bold break-words text-ink">
                “{turn.asr.corrected}”
              </dd>
            </div>
          </dl>
        ) : turn.heard ? (
          <p lang="vi" className="mt-2 font-display text-2xl font-bold break-words text-ink">
            “{turn.heard}”
          </p>
        ) : null}
      </div>

      {parse ? <Understanding parse={parse} /> : null}

      {turn.error ? (
        <div className="flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-soft p-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-danger" />
          <p className="text-base">
            <span className="font-bold">{tt.errorTitle}: </span>
            {renderReply(errorRef(turn.error), lang).text}
          </p>
        </div>
      ) : null}

      {turn.replies.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-muted">{tt.replies}</h3>
          <ul className="mt-1 space-y-1">
            {turn.replies.map((ref, i) => (
              <li key={i} className="text-lg text-ink">
                {renderReply(ref, lang).text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function regionList(regions: DialectRegion[] | undefined, names: DemoDict['regions']): string {
  return (regions ?? []).map((r) => names[r]).join(', ')
}

function SubstitutionList({ label, subs, t }: { label: string; subs: Substitution[]; t: DemoDict }) {
  if (subs.length === 0) return null
  return (
    <div className="text-base">
      <span className="font-semibold">{label}: </span>
      <ul className="inline">
        {subs.map((s, i) => {
          const extra = s.kind === 'dialect' ? regionList(s.region, t.regions) : t.transcript.kinds[s.kind]
          return (
            <li key={`${s.from}|${s.to}|${i}`} className="inline">
              {i > 0 ? ' · ' : null}
              <span lang="vi" className="font-semibold italic">
                {s.from}
              </span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> {t.transcript.means} </span>
              <span lang="vi" className="font-semibold italic">
                {s.to}
              </span>
              {extra ? <span className="text-muted"> ({extra})</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Understanding({ parse }: { parse: ParseResult }) {
  const lang = useLang()
  const t = useDict(demoDict)
  const tt = t.transcript
  const segments = highlightSegments(parse.normalizedText, parse.substitutions)
  const subs = uniqueSubstitutions(parse.substitutions)
  const dialectSubs = subs.filter((s) => s.kind === 'dialect')
  const otherSubs = subs.filter((s) => s.kind !== 'dialect')
  const hintRegions = (Object.keys(parse.dialectHints) as DialectRegion[]).filter(
    (r) => (parse.dialectHints[r] ?? 0) > 0,
  )

  return (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-muted">{tt.understood}</h3>
          {hintRegions.length > 0 ? (
            <Badge tone="sun">
              {tt.dialectList}: {regionList(hintRegions, t.regions)}
            </Badge>
          ) : null}
        </div>
        {parse.normalizedText ? (
          <p lang="vi" className="mt-1 text-xl leading-relaxed break-words text-ink" data-testid="normalized">
            {segments.map((seg, i) =>
              seg.sub ? (
                <mark
                  key={i}
                  className="rounded-sm bg-sun-soft px-0.5 font-bold text-ink underline decoration-warning decoration-[3px] underline-offset-4"
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        ) : null}
        <div className="mt-2 space-y-1">
          <SubstitutionList label={tt.dialectList} subs={dialectSubs} t={t} />
          <SubstitutionList label={tt.otherList} subs={otherSubs} t={t} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-muted">{tt.intents}</h3>
        <div className="mt-1.5">
          {parse.actions.length > 0 ? (
            <IntentChips actions={parse.actions} />
          ) : (
            <p className="text-base text-muted">{tt.noIntents}</p>
          )}
        </div>
      </div>

      {parse.suggestions.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-muted">{tt.suggestions}</h3>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {parse.suggestions.map((s) => (
              <li key={s.say}>
                <Chip onClick={() => void submitCommand(s.say, 'chip')}>
                  {lang === 'vi' ? (
                    <span lang="vi">{s.say}</span>
                  ) : (
                    <span className="flex flex-col leading-tight">
                      <span lang="vi" className="font-semibold">
                        {s.say}
                      </span>
                      <span className="text-sm text-muted">{s.label.en}</span>
                    </span>
                  )}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
