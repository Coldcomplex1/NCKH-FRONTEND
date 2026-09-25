import { Credits } from './sections/Credits'
import { Dataset } from './sections/Dataset'
import { Errors } from './sections/Errors'
import { Overview } from './sections/Overview'
import { Pipeline } from './sections/Pipeline'
import { Problem } from './sections/Problem'
import { Quality } from './sections/Quality'
import { Regions } from './sections/Regions'
import { Results } from './sections/Results'
import { Team } from './sections/Team'
import { useResearch } from './useResearch'

/**
 * The research half of the page (below the demo): overview → problem → pipeline → results → quality →
 * regions → errors → dataset → team → credits. Every figure comes from content/stats.ts.
 */
export function ResearchSection() {
  const { t } = useResearch()
  return (
    <section id="research" aria-label={t.label}>
      <Overview />
      <Problem />
      <Pipeline />
      <Results />
      <Quality />
      <Regions />
      <Errors />
      <Dataset />
      <Team />
      <Credits />
    </section>
  )
}
