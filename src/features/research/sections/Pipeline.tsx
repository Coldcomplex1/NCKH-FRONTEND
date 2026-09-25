import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Bot,
  BrainCircuit,
  Ear,
  Workflow,
  WandSparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { PipelineNodeId } from '@/content/research'
import { Badge, Disclosure } from '@/components/ui'
import { cn } from '@/lib/cn'
import { Rich } from '../components/Rich'
import { Section, Sticker, type StickerTint } from '../components/Section'
import { useResearch } from '../useResearch'

const NODES: { id: PipelineNodeId; icon: ReactNode; tint: StickerTint }[] = [
  { id: 'input', icon: <AudioLines className="size-7" />, tint: 'primary' },
  { id: 'asr', icon: <Ear className="size-7" />, tint: 'accent' },
  { id: 'qwen', icon: <WandSparkles className="size-7" />, tint: 'sun' },
  { id: 'nlu', icon: <BrainCircuit className="size-7" />, tint: 'success' },
  { id: 'robot', icon: <Bot className="size-7" />, tint: 'primary' },
]

/** The five-step pipeline as an ordered list of HTML cards (row on desktop, column on mobile). */
export function Pipeline() {
  const { t, f, s } = useResearch()
  const p = t.pipeline
  return (
    <Section
      id="pipeline"
      tone="soft"
      title={p.heading}
      intro={p.intro}
      icon={<Workflow className="size-7" />}
      tint="primary"
    >
      <ol className="m-0 flex list-none flex-col p-0 lg:flex-row lg:items-stretch">
        {NODES.map((n, i) => {
          const node = p.nodes[n.id]
          const soon = n.id === 'qwen'
          const last = i === NODES.length - 1
          return (
            <li
              key={n.id}
              className="flex min-w-0 flex-col items-center lg:flex-1 lg:flex-row lg:items-stretch"
            >
              <div
                className={cn(
                  'flex w-full min-w-0 flex-1 flex-col rounded-lg border-2 bg-surface p-4 shadow-soft',
                  soon ? 'border-dashed border-line-strong' : 'border-line',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Sticker icon={n.icon} tint={n.tint} />
                  {soon ? <Badge>{t.common.soon}</Badge> : null}
                </div>
                <p className="mt-3 mb-0 text-sm font-semibold text-muted">
                  {p.stepLabel(i + 1, NODES.length)}
                </p>
                <h3 className="mt-0.5 mb-1 font-display text-lg font-extrabold break-words">{node.title}</h3>
                <p className="m-0 text-muted">{node.sub(s, f)}</p>
                <Disclosure
                  className="mt-auto pt-2"
                  summary={
                    <>
                      {p.more}
                      <span className="sr-only">: {node.title}</span>
                    </>
                  }
                >
                  <p className="m-0">
                    <Rich text={node.body(s, f)} />
                  </p>
                </Disclosure>
              </div>
              {!last ? (
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center py-1.5 text-line-strong lg:px-1.5 lg:py-0"
                >
                  <ArrowDown className="size-7 lg:hidden" />
                  <ArrowRight className="hidden size-7 lg:block" />
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </Section>
  )
}
