import { Ear, HeartHandshake, Info, MapPinned, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { Rich } from '../components/Rich'
import { Panel, Section, Sticker, type StickerTint } from '../components/Section'
import { useResearch } from '../useResearch'

function ProblemCard({
  icon,
  tint,
  title,
  children,
}: {
  icon: ReactNode
  tint: StickerTint
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex">
      <Panel className="flex w-full flex-col">
        <Sticker icon={icon} tint={tint} className="mb-4" />
        <h3 className="mt-0 mb-2 font-display text-xl font-extrabold">{title}</h3>
        {children}
      </Panel>
    </li>
  )
}

/** Why the project matters: a qualitative card, a card built from our own numbers, and the goal. */
export function Problem() {
  const { t, f, s } = useResearch()
  const p = t.problem
  return (
    <Section
      id="problem"
      title={p.heading}
      intro={p.intro}
      icon={<HeartHandshake className="size-7" />}
      tint="accent"
    >
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
        <ProblemCard icon={<Ear className="size-7" />} tint="primary" title={p.access.title}>
          <p className="m-0">{p.access.body}</p>
        </ProblemCard>
        <ProblemCard icon={<MapPinned className="size-7" />} tint="accent" title={p.data.title}>
          <p className="m-0">
            <Rich text={p.data.body(s, f)} />
          </p>
          <p className="mt-auto mb-0 flex gap-2 pt-4 text-sm text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>{p.data.caveat(s, f)}</span>
          </p>
        </ProblemCard>
        <ProblemCard icon={<Target className="size-7" />} tint="success" title={p.goal.title}>
          <p className="m-0">{p.goal.body(s, f)}</p>
        </ProblemCard>
      </ul>
    </Section>
  )
}
