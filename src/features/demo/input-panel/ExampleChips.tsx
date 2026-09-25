import {
  Footprints,
  Home,
  Info,
  MapPinned,
  MessageCircle,
  TestTubeDiagonal,
  type LucideIcon,
} from 'lucide-react'
import { Chip } from '@/components/ui'
import { useDict, useLang } from '@/i18n'
import { demoDict } from '../dict'
import { submitCommand } from '../pipeline'
import { EXAMPLE_GROUPS, type ExampleCategory } from './examples'

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
  const t = useDict(demoDict).chips

  return (
    <section aria-labelledby="chips-title" className="flex flex-col gap-3">
      <div>
        <h2 id="chips-title" className="font-display text-xl font-extrabold text-ink">
          {t.heading}
        </h2>
        <p className="text-base text-muted">{t.intro}</p>
      </div>
      {EXAMPLE_GROUPS.map((group) => {
        const Icon = CATEGORY_ICONS[group.category]
        const headingId = `chips-${group.category}`
        return (
          <div key={group.category} role="group" aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink">
              <Icon aria-hidden="true" className="size-5 text-muted" />
              {t.categories[group.category]}
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
