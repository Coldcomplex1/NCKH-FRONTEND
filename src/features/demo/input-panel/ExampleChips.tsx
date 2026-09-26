import {
  Footprints,
  Home,
  Info,
  MapPinned,
  MessageCircle,
  TestTubeDiagonal,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { Chip } from '@/components/ui'
import { useDict, useLang } from '@/i18n'
import { useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'
import { submitCommand } from '../pipeline'
import { AI_EXAMPLES, EXAMPLE_GROUPS, type ExampleCategory, type ExampleChip } from './examples'

const CATEGORY_ICONS: Record<ExampleCategory, LucideIcon> = {
  motion: Footprints,
  info: Info,
  chat: MessageCircle,
  home: Home,
  dialect: MapPinned,
  limit: TestTubeDiagonal,
}

/**
 * The example commands fixed by the build brief, grouped by category. A tap sends immediately
 * (source 'chip'). Commands are always Vietnamese: the English UI shows them with lang="vi" and a
 * short English gloss.
 */
export function ExampleChips() {
  const lang = useLang()
  const d = useDict(demoDict)
  const t = d.chips
  const aiOn = useDemo((s) => s.aiMoves === 'on')
  const groups: {
    key: string
    category: ExampleCategory
    icon: LucideIcon
    title: string
    chips: ExampleChip[]
  }[] = [
    ...EXAMPLE_GROUPS.map((g) => ({
      key: g.category,
      category: g.category,
      icon: CATEGORY_ICONS[g.category],
      title: t.categories[g.category],
      chips: g.chips,
    })),
    ...(aiOn
      ? [
          {
            key: 'ai',
            category: 'motion' as const,
            icon: WandSparkles,
            title: d.ai.heading,
            chips: AI_EXAMPLES,
          },
        ]
      : []),
  ]

  return (
    <section aria-labelledby="chips-title" className="flex flex-col gap-3">
      <div>
        <h2 id="chips-title" className="font-display text-xl font-extrabold text-ink">
          {t.heading}
        </h2>
        <p className="text-base text-muted">{t.intro}</p>
      </div>
      {groups.map((group) => {
        const Icon = group.icon
        const headingId = `chips-${group.key}`
        return (
          <div key={group.key} role="group" aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink">
              <Icon aria-hidden="true" className="size-5 text-muted" />
              {group.title}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {group.chips.map((chip) => (
                <li key={chip.vi}>
                  <Chip category={group.category} onClick={() => void submitCommand(chip.vi, 'chip')}>
                    <span className="flex flex-col leading-tight">
                      <span lang="vi" className="font-semibold">
                        {chip.vi}
                      </span>
                      {lang === 'en' || chip.tag ? (
                        <span className="text-sm text-muted">
                          {[lang === 'en' ? chip.en : null, chip.tag ? t.tags[chip.tag] : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      ) : null}
                    </span>
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
