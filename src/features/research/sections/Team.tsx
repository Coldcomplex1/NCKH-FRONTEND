import { GraduationCap, Users } from 'lucide-react'
import { project } from '@/content/project'
import { Panel, Section, Sticker } from '../components/Section'
import { Vi } from '../components/Vi'
import { useResearch } from '../useResearch'

/** Team badge, mentor card and — only when names exist in project.ts — the members grid. */
export function Team() {
  const { t, lang } = useResearch()
  const c = t.team
  return (
    <Section id="team" tone="soft" title={c.heading} icon={<Users className="size-7" />} tint="sun">
      <div className="grid gap-6 md:grid-cols-2">
        <Panel className="flex flex-col justify-center">
          <p className="m-0 font-display text-4xl font-black">{c.team(project.team)}</p>
          <p className="mt-2 mb-0 text-muted">{c.intro}</p>
        </Panel>
        <Panel>
          <div className="flex items-start gap-4">
            <Sticker icon={<GraduationCap className="size-7" />} tint="primary" />
            <div>
              <h3 className="m-0 font-sans text-base font-semibold text-muted">{c.mentor}</h3>
              <p className="mt-1 mb-0 font-display text-2xl font-extrabold">
                {lang === 'vi' ? (
                  project.mentor.name.vi
                ) : (
                  <>
                    {project.mentor.honorific.en} <Vi>{project.mentor.personName}</Vi>
                  </>
                )}
              </p>
              <p className="mt-1 mb-0">{project.mentor.role[lang]}</p>
            </div>
          </div>
        </Panel>
      </div>

      {project.members.length > 0 ? (
        <div className="mt-6">
          <h3 className="mt-0 mb-4 font-display text-xl font-extrabold">{c.members}</h3>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {project.members.map((m) => (
              <li
                key={m}
                lang="vi"
                className="rounded-lg border-2 border-line bg-surface p-4 font-semibold shadow-soft"
              >
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  )
}
