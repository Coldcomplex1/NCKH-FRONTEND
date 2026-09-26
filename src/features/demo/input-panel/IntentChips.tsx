import { ChevronRight, WandSparkles } from 'lucide-react'
import { Fragment } from 'react'
import type { ActionCategory } from '@/core/actions'
import type { ParsedAction } from '@/core/parser'
import { useDict, useFmt, useLang } from '@/i18n'
import { cn } from '@/lib/cn'
import { demoDict } from '../dict'
import { describeAction } from '../intents'

const CAT: Record<ActionCategory, string> = {
  motion: 'border-cat-motion bg-cat-motion-soft',
  info: 'border-cat-info bg-cat-info-soft',
  chat: 'border-cat-chat bg-cat-chat-soft',
  home: 'border-cat-home bg-cat-home-soft',
  meta: 'border-cat-limit bg-cat-limit-soft',
}

/**
 * The parsed actions in execution order: order number, icon, localized label, detail and "×3".
 * Non-interactive (a list, not buttons).
 */
export function IntentChips({ actions, compact = false }: { actions: ParsedAction[]; compact?: boolean }) {
  const lang = useLang()
  const fmt = useFmt()
  const t = useDict(demoDict).transcript
  if (actions.length === 0) return null
  const many = actions.length > 1

  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {actions.map((pa, i) => {
        const v = describeAction(pa.action, lang, fmt)
        const Icon = v.icon
        return (
          <Fragment key={i}>
            {i > 0 ? (
              <li aria-hidden="true" className="text-muted">
                <ChevronRight className="size-5" />
              </li>
            ) : null}
            <li
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border-2 text-ink',
                compact ? 'min-h-9 px-2.5 text-sm' : 'min-h-11 px-3 text-base',
                CAT[v.category],
                pa.negated && 'line-through decoration-2',
              )}
            >
              {many ? (
                <>
                  <span
                    aria-hidden="true"
                    className="inline-grid size-6 place-items-center rounded-full bg-ink text-sm font-bold text-surface"
                  >
                    {i + 1}
                  </span>
                  <span className="sr-only">{t.order(i + 1)}:</span>
                </>
              ) : null}
              <Icon aria-hidden="true" className={compact ? 'size-4' : 'size-5'} />
              <span className="font-semibold">{v.label}</span>
              {v.detail ? <span className="text-muted">· {v.detail}</span> : null}
              {v.count !== undefined && v.count > 1 ? (
                <span className="font-bold tabular-nums">×{fmt.int(v.count)}</span>
              ) : null}
              {pa.source === 'llm' && pa.action.type === 'custom_move' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-surface">
                  <WandSparkles aria-hidden="true" className="size-3.5" />
                  {compact ? t.aiBadgeShort : t.aiBadge}
                </span>
              ) : null}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
