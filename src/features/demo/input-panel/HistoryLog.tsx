import { Bot, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useDict, useLang } from '@/i18n'
import { renderReply } from '@/replies'
import { demo, useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'
import { clockHm } from '../format'
import { errorRef } from '../turnErrors'
import { IntentChips } from './IntentChips'
import { SOURCE_ICONS } from './turnView'

/**
 * The last 10 turns (the store keeps no more), newest first: Vietnam time, what the user said, the
 * robot's replies rendered in the CURRENT language, and the intents. No re-run / "see more" in v1.
 */
export function HistoryLog() {
  const turns = useDemo((s) => s.turns)
  const lang = useLang()
  const t = useDict(demoDict)
  const th = t.history

  return (
    <section
      aria-labelledby="history-title"
      className="rounded-xl border-2 border-line-strong bg-surface p-4 text-ink sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="history-title" className="font-display text-xl font-extrabold">
            {th.title}
          </h2>
          {turns.length > 0 ? <p className="text-sm text-muted">{th.subtitle(turns.length)}</p> : null}
        </div>
        {turns.length > 0 ? (
          <Button variant="ghost" icon={<Trash2 className="size-5" />} onClick={() => demo().clearHistory()}>
            {th.clear}
          </Button>
        ) : null}
      </div>

      {turns.length === 0 ? (
        <p className="mt-3 text-base text-muted">{th.empty}</p>
      ) : (
        <ol className="mt-3 divide-y-2 divide-line">
          {turns.map((turn) => {
            const SourceIcon = SOURCE_ICONS[turn.source]
            const time = clockHm(turn.at)
            return (
              <li key={turn.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <time
                    dateTime={new Date(turn.at).toISOString()}
                    className="mt-0.5 shrink-0 text-sm font-bold text-muted tabular-nums"
                  >
                    <span className="sr-only">{th.at(time)}</span>
                    <span aria-hidden="true">{time}</span>
                  </time>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex items-start gap-2 text-base">
                      <SourceIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted" />
                      <span className="min-w-0">
                        <span className="font-bold">{th.you}: </span>
                        <span lang="vi" className="break-words">
                          {turn.heard || '…'}
                        </span>
                      </span>
                    </p>
                    {turn.replies.map((ref, i) => (
                      <p key={i} className="flex items-start gap-2 text-base">
                        <Bot aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="font-bold">{th.robot}: </span>
                          {renderReply(ref, lang).text}
                        </span>
                      </p>
                    ))}
                    {turn.status === 'processing' ? (
                      <p className="text-sm text-muted">{th.processing}</p>
                    ) : null}
                    {turn.status === 'interrupted' ? (
                      <p className="text-sm text-muted">{th.interrupted}</p>
                    ) : null}
                    {turn.status === 'error' ? (
                      <p className="text-sm text-danger">
                        {th.error}: {renderReply(errorRef(turn.error), lang).text}
                      </p>
                    ) : null}
                    {turn.parse && turn.parse.actions.length > 0 ? (
                      <IntentChips actions={turn.parse.actions} compact />
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
