import { ArrowDown, Bot, GraduationCap } from 'lucide-react'
import { REPORT_URL } from '@/content/credits'
import { project } from '@/content/project'
import { Badge } from '@/components/ui'
import { LinkButton } from '../components/Links'
import { Vi } from '../components/Vi'
import { useResearch } from '../useResearch'

/** Hero: eyebrow, the project title in both languages, lede, mentor and the three calls to action. */
export function Overview() {
  const { t, f, s, lang } = useResearch()
  const other = lang === 'vi' ? 'en' : 'vi'
  return (
    <section
      id="overview"
      aria-labelledby="overview-title"
      className="relative isolate overflow-hidden border-t-2 border-line bg-surface-2 px-4 py-16 sm:py-24 lg:px-6"
    >
      {/* Decorative soft-pop blobs. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-28 -right-24 size-80 rounded-full bg-sun-soft dark:opacity-60" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-primary-soft" />
        <div className="absolute top-1/3 right-[12%] hidden size-16 rounded-2xl bg-accent-soft motion-safe:rotate-12 lg:block" />
      </div>

      <div className="mx-auto max-w-[72rem]">
        <Badge tone="sun" className="px-4 py-1 text-base">
          <GraduationCap aria-hidden="true" className="size-5" />
          {t.overview.eyebrow(project.team)}
        </Badge>

        <h2
          id="overview-title"
          className="mt-5 mb-0 max-w-5xl font-display text-2xl font-black sm:text-4xl lg:text-[3.1rem] lg:leading-[1.22]"
        >
          {project.title[lang]}
        </h2>
        <p className="mt-5 mb-0 max-w-4xl text-muted">
          <span className="font-semibold">{t.overview.otherTitle}: </span>
          <span lang={other}>{project.title[other]}</span>
        </p>

        <p className="mt-8 mb-0 max-w-3xl text-xl">{t.overview.lede(s, f)}</p>

        <p className="mt-5 mb-0 max-w-3xl text-muted">
          {t.overview.mentor}:{' '}
          <strong className="font-bold text-ink">
            {lang === 'vi' ? (
              project.mentor.name.vi
            ) : (
              <>
                {project.mentor.honorific.en} <Vi>{project.mentor.personName}</Vi>
              </>
            )}
          </strong>
          {' — '}
          {project.mentor.role[lang]}
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <LinkButton href="#demo" variant="primary" icon={<Bot className="size-6" />}>
            {t.overview.tryRobot}
          </LinkButton>
          <LinkButton href="#results" icon={<ArrowDown className="size-5" />}>
            {t.overview.seeResults}
          </LinkButton>
          <LinkButton href={REPORT_URL} external newTabText={t.common.newTab}>
            {t.overview.fullReport}
          </LinkButton>
        </div>
      </div>
    </section>
  )
}
