import {
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock,
  LoaderCircle,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { Fragment } from 'react'
import { useDict } from '@/i18n'
import { cn } from '@/lib/cn'
import { useDemo, type StageId, type StageState } from '@/store/demoStore'
import { demoDict } from '../dict'

const ORDER: StageId[] = ['input', 'asr', 'qwen', 'nlu', 'robot']

const STATE_STYLE: Record<StageState, { icon: LucideIcon; box: string; iconCls: string }> = {
  idle: { icon: Circle, box: 'border-line bg-surface text-muted', iconCls: 'text-muted' },
  active: {
    icon: LoaderCircle,
    box: 'border-primary bg-primary-soft text-ink',
    iconCls: 'animate-spin text-primary',
  },
  done: { icon: Check, box: 'border-success bg-success-soft text-ink', iconCls: 'text-success' },
  skipped: { icon: Minus, box: 'border-line bg-surface-2 text-muted', iconCls: 'text-muted' },
  error: { icon: CircleAlert, box: 'border-danger bg-danger-soft text-ink', iconCls: 'text-danger' },
  soon: { icon: Clock, box: 'border-dashed border-line-strong bg-surface text-muted', iconCls: 'text-muted' },
}

/** Input → ASR → Qwen → NLU → Robot, each with an icon AND a visible state label (never colour alone). */
export function PipelineIndicator() {
  const stages = useDemo((s) => s.stages)
  const t = useDict(demoDict).pipeline

  return (
    <ol aria-label={t.label} className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {ORDER.map((id, i) => {
        const state = stages[id]
        const st = STATE_STYLE[state]
        const Icon = st.icon
        return (
          <Fragment key={id}>
            {i > 0 ? (
              <li aria-hidden="true" className="text-muted">
                <ChevronRight className="size-4" />
              </li>
            ) : null}
            <li
              data-stage={id}
              data-state={state}
              className={cn('flex items-center gap-1.5 rounded-lg border-2 px-2 py-1 leading-tight', st.box)}
            >
              <Icon aria-hidden="true" className={cn('size-5 shrink-0', st.iconCls)} />
              <span className="flex flex-col">
                <span className="text-sm font-bold text-ink">
                  <span aria-hidden="true">{t.short[id]}</span>
                  <span className="sr-only">{t.steps[id]}:</span>
                </span>
                <span className="text-sm">{t.states[state]}</span>
              </span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
