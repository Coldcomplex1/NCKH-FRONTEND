import {
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  LoaderCircle,
  Moon,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InfoCard } from '@/core/engine'
import type { Lang } from '@/core/lang'
import type { WeatherData } from '@/core/weather'
import { describeWeatherCode, type WeatherIcon } from '@/core/wmo'
import { useDict, useFmt, useLang, type Fmt } from '@/i18n'
import { ZODIAC } from '@/lib/calendar/lunar'
import { cn } from '@/lib/cn'
import { useIsWideLayout } from '@/lib/hooks'
import { partOfDay, vnDateOffset, vnParts } from '@/lib/vnTime'
import { demo, useDemo } from '@/store/demoStore'
import { demoDict, type DemoDict } from '../dict'
import { formatMathExpr, formatVnDate, pad2 } from '../format'
import { useNow } from '../useNow'
import { lunarCountdown, lunarInfo } from './lunarInfo'

type CardDict = DemoDict['card']

const WEATHER_ICONS: Record<WeatherIcon, LucideIcon> = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

/** After the pointer/focus leaves an expired card, keep it this long before hiding it. */
const LINGER_MS = 3000

/**
 * The one info card (time, date, lunar, weather, math, capabilities, about) from `store.card`.
 * On desktop it hides when `expiresAt` passes — but never while the user is hovering or focusing it
 * (e.g. reading, or reaching for the Open-Meteo link). It always has a ≥ 48px close button.
 */
export function InfoCardView() {
  const entry = useDemo((s) => s.card)
  const d = useDict(demoDict).card
  // The hold belongs to ONE card (by id): a card closed with X while hovered/focused never gets
  // its pointerleave/focusout, and must not leave the next card held forever.
  const [heldId, setHeldId] = useState<number | null>(null)
  const [released, setReleased] = useState<{ id: number; at: number } | null>(null)

  const id = entry?.id
  const held = id !== undefined && heldId === id
  const releasedAt = released && released.id === id ? released.at : 0
  const expiresAt = entry?.expiresAt ?? null
  // Desktop: the card floats over the room and hides at `expiresAt`. Mobile: it sits in the page
  // flow under the robot, so it stays until the NEXT command (like the bubble) — hiding it on a
  // timer would make the page jump under the reader's finger.
  const wide = useIsWideLayout()
  const latestTurnId = useDemo((s) => s.turns[0]?.id)
  const cardTurnRef = useRef<{ cardId: number; turnId: string | undefined } | null>(null)

  useEffect(() => {
    if (id === undefined || expiresAt === null || held || !wide) return
    const now = Date.now()
    // Leaving an already-expired card gives it a short grace period instead of vanishing instantly.
    const wait = Math.max(expiresAt - now, releasedAt + LINGER_MS - now, 0)
    const timer = setTimeout(() => demo().clearCard(id), wait)
    return () => clearTimeout(timer)
  }, [id, expiresAt, held, releasedAt, wide])

  useEffect(() => {
    if (id === undefined) return
    if (cardTurnRef.current?.cardId !== id) {
      cardTurnRef.current = { cardId: id, turnId: latestTurnId }
      return
    }
    if (!wide && latestTurnId !== cardTurnRef.current.turnId) demo().clearCard(id)
  }, [id, latestTurnId, wide])

  // Hold the card while it is hovered or focused. A ref callback (React 19 cleanup) re-attaches the
  // listeners for every new card element; JSX handlers would put interactions on a non-interactive region.
  const holdRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || id === undefined) return
      const hold = () => setHeldId(id)
      const release = () => {
        setHeldId((cur) => (cur === id ? null : cur))
        setReleased({ id, at: Date.now() })
      }
      const onFocusOut = (e: FocusEvent) => {
        if (!el.contains(e.relatedTarget as Node | null)) release()
      }
      el.addEventListener('pointerenter', hold)
      el.addEventListener('pointerleave', release)
      el.addEventListener('focusin', hold)
      el.addEventListener('focusout', onFocusOut)
      return () => {
        el.removeEventListener('pointerenter', hold)
        el.removeEventListener('pointerleave', release)
        el.removeEventListener('focusin', hold)
        el.removeEventListener('focusout', onFocusOut)
      }
    },
    [id],
  )

  if (!entry) return null
  const { card } = entry
  const title = cardTitle(card, d)

  return (
    <section
      key={entry.id}
      ref={holdRef}
      aria-label={`${d.label}: ${title}`}
      className="pointer-events-auto relative w-full animate-pop-in rounded-xl border-2 border-ink bg-surface p-4 text-ink shadow-pop sm:p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="pt-1 font-display text-lg leading-tight font-extrabold text-primary">{title}</h2>
        <button
          type="button"
          onClick={() => {
            setHeldId(null)
            demo().clearCard(entry.id)
          }}
          aria-label={d.close}
          className="-mt-2 -mr-2 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>
      <CardBody card={card} />
    </section>
  )
}

function cardTitle(card: InfoCard, d: CardDict): string {
  switch (card.kind) {
    case 'date':
      return `${d.titles.date} · ${d.dayOffset[String(card.dayOffset) as keyof CardDict['dayOffset']]}`
    case 'weather':
      return d.titles.weather
    default:
      return d.titles[card.kind]
  }
}

function CardBody({ card }: { card: InfoCard }) {
  switch (card.kind) {
    case 'time':
      return <TimeBody />
    case 'date':
      return <DateBody iso={card.iso} dayOffset={card.dayOffset} />
    case 'lunar':
      return <LunarBody iso={card.iso} query={card.query} />
    case 'weather':
      return <WeatherBody card={card} />
    case 'math':
      return <MathBody card={card} />
    case 'capabilities':
      return <CapabilitiesBody />
    case 'about':
      return <AboutBody />
  }
}

/** The card's main value. No tailwind-merge here, so the size is a prop, not a class override. */
const Big = ({
  children,
  size = 'xl',
  className,
}: {
  children: ReactNode
  size?: 'lg' | 'xl'
  className?: string
}) => (
  <p
    className={cn(
      'font-display leading-tight font-extrabold text-ink',
      size === 'xl' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl',
      className,
    )}
  >
    {children}
  </p>
)
const Line = ({ children }: { children: ReactNode }) => <p className="mt-1 text-base text-ink">{children}</p>
const Muted = ({ children }: { children: ReactNode }) => <p className="mt-1 text-sm text-muted">{children}</p>

function TimeBody() {
  const lang = useLang()
  const d = useDict(demoDict).card
  const now = useNow()
  const p = vnParts(new Date(now))
  return (
    <>
      <Big className="tabular-nums">
        {pad2(p.hour)}:{pad2(p.minute)}
        <span className="text-2xl text-muted">:{pad2(p.second)}</span>
      </Big>
      <Line>
        {d.partOfDay[partOfDay(p.hour)]} · {formatVnDate(p, lang)}
      </Line>
      <Muted>{d.vnTime}</Muted>
    </>
  )
}

function DateBody({ iso, dayOffset }: { iso: string; dayOffset: -1 | 0 | 1 | 2 }) {
  const lang = useLang()
  const d = useDict(demoDict).card
  const p = vnDateOffset(new Date(iso), dayOffset)
  // Noon in Vietnam on that calendar day.
  const info = lunarInfo(new Date(`${p.year}-${pad2(p.month)}-${pad2(p.day)}T12:00:00+07:00`))
  const full = formatVnDate(p, lang)
  const [weekday, ...rest] = full.split(', ')
  return (
    <>
      <Big>{weekday}</Big>
      <Line>{rest.join(', ')}</Line>
      <Muted>{d.lunarLine(info.lunar.day, info.lunar.month, info.canChi)}</Muted>
      {info.festival ? <Line>{d.festival(info.festival.name[lang])}</Line> : null}
    </>
  )
}

function LunarBody({ iso, query }: { iso: string; query: 'date' | 'year' | 'tet' | 'ram' | 'mung1' }) {
  const lang = useLang()
  const d = useDict(demoDict).card
  const at = new Date(iso)
  const info = lunarInfo(at)
  const animal = ZODIAC[lang][info.zodiac] ?? ''
  const animalText = lang === 'vi' ? animal.toLowerCase() : animal

  if (query === 'tet' || query === 'ram' || query === 'mung1') {
    const { days, target } = lunarCountdown(at, query)
    const until = query === 'tet' ? d.untilTet(days) : query === 'ram' ? d.untilRam(days) : d.untilMung1(days)
    return (
      <>
        <Big size="lg">{until}</Big>
        {days > 0 ? <Line>{d.on(formatVnDate(target, lang))}</Line> : null}
        <Muted>{d.lunarLine(info.lunar.day, info.lunar.month, info.canChi)}</Muted>
      </>
    )
  }
  if (query === 'year') {
    return (
      <>
        <Big size="lg">{d.lunarYear(info.canChi, animalText)}</Big>
        <Muted>{d.solarLine(formatVnDate(info.solar, lang))}</Muted>
      </>
    )
  }
  return (
    <>
      <Big size="lg">{d.lunarDate(info.lunar.day, info.lunar.month, info.lunar.leap)}</Big>
      <Line>{d.lunarYear(info.canChi, animalText)}</Line>
      <Muted>{d.solarLine(formatVnDate(info.solar, lang))}</Muted>
      {info.festival ? <Line>{d.festival(info.festival.name[lang])}</Line> : null}
    </>
  )
}

function Attribution({ d }: { d: CardDict['weather'] }) {
  return (
    <p className="mt-3 border-t-2 border-line pt-2 text-sm">
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={d.attributionLabel}
        className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline underline-offset-4"
      >
        {d.attribution}
        <ExternalLink aria-hidden="true" className="size-4" />
      </a>
    </p>
  )
}

const deg = (n: number, fmt: Fmt) => `${fmt.int(n)}°C`

function WeatherBody({ card }: { card: Extract<InfoCard, { kind: 'weather' }> }) {
  const lang = useLang()
  const fmt = useFmt()
  const d = useDict(demoDict).card
  const w = d.weather
  const place = card.place[lang]
  const when = d.dayOffset[String(card.dayOffset) as keyof CardDict['dayOffset']]

  const header = (
    <p className="mb-2 text-base font-bold text-ink">
      {place} · {when}
    </p>
  )

  if (card.status === 'loading') {
    return (
      <>
        {header}
        <p className="flex items-center gap-2 text-base text-ink">
          <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary" />
          {w.loading(place)}
        </p>
        <Attribution d={w} />
      </>
    )
  }
  if (card.status === 'error' || !card.data) {
    return (
      <>
        {header}
        <p className="flex items-start gap-2 text-base text-ink">
          <CloudOff aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-danger" />
          {w.error(place)}
        </p>
        <Attribution d={w} />
      </>
    )
  }

  return (
    <>
      {header}
      {card.dayOffset === 0 ? (
        <CurrentWeather data={card.data} lang={lang} fmt={fmt} d={w} />
      ) : (
        <DailyWeather data={card.data} dayOffset={card.dayOffset} lang={lang} fmt={fmt} d={w} />
      )}
      <Attribution d={w} />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base font-bold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

interface WeatherProps {
  data: WeatherData
  lang: Lang
  fmt: Fmt
  d: CardDict['weather']
}

function CurrentWeather({ data, lang, fmt, d }: WeatherProps) {
  const c = data.current
  const desc = describeWeatherCode(c.code)
  const Icon = desc.icon === 'sun' && !c.isDay ? Moon : WEATHER_ICONS[desc.icon]
  const today = data.daily[0]
  return (
    <>
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-12 shrink-0 text-accent-ink" strokeWidth={1.75} />
        <div>
          <Big className="tabular-nums">{deg(c.tempC, fmt)}</Big>
          <p className="text-base font-semibold text-ink first-letter:uppercase">{desc.text[lang]}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Stat label={d.feelsLike} value={deg(c.feelsLikeC, fmt)} />
        <Stat label={d.humidity} value={`${fmt.int(c.humidity)}%`} />
        <Stat label={d.wind} value={`${fmt.int(c.windKmh)} km/h`} />
        {today ? (
          <Stat label={d.highLow} value={`${deg(today.maxC, fmt)} / ${deg(today.minC, fmt)}`} />
        ) : null}
        {today?.precipProbability != null ? (
          <Stat label={d.rainChance} value={`${fmt.int(today.precipProbability)}%`} />
        ) : null}
      </dl>
    </>
  )
}

function DailyWeather({ data, dayOffset, lang, fmt, d }: WeatherProps & { dayOffset: 1 | 2 }) {
  const day = data.daily[dayOffset]
  if (!day) return <p className="text-base text-ink">{d.error('')}</p>
  const desc = describeWeatherCode(day.code)
  const Icon = WEATHER_ICONS[desc.icon]
  return (
    <>
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-12 shrink-0 text-accent-ink" strokeWidth={1.75} />
        <div>
          <Big className="tabular-nums">
            {deg(day.maxC, fmt)} <span className="text-2xl text-muted">/ {deg(day.minC, fmt)}</span>
          </Big>
          <p className="text-base font-semibold text-ink first-letter:uppercase">{desc.text[lang]}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label={d.highLow} value={`${deg(day.maxC, fmt)} / ${deg(day.minC, fmt)}`} />
        {day.precipProbability != null ? (
          <Stat label={d.rainChance} value={`${fmt.int(day.precipProbability)}%`} />
        ) : null}
      </dl>
    </>
  )
}

function MathBody({ card }: { card: Extract<InfoCard, { kind: 'math' }> }) {
  const fmt = useFmt()
  const d = useDict(demoDict).card
  const expr = formatMathExpr(card.expr, fmt)
  if (card.result === null || card.error) {
    return (
      <>
        <Big className="tabular-nums">{expr} = ?</Big>
        <Line>{card.error === 'div0' ? d.math.div0 : d.math.overflow}</Line>
      </>
    )
  }
  return (
    <Big className="tabular-nums">
      {expr} = <span className="text-primary">{fmt.numFlex(card.result)}</span>
    </Big>
  )
}

function CapabilitiesBody() {
  const d = useDict(demoDict).card
  return (
    <ul className="space-y-1.5">
      {d.capabilities.map((line) => (
        <li key={line} className="flex items-start gap-2 text-base text-ink">
          <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
          {line}
        </li>
      ))}
    </ul>
  )
}

function AboutBody() {
  const d = useDict(demoDict).card
  const lang = useLang()
  return (
    <div className="space-y-2">
      {d.about.map((line) => (
        <p key={line} className="text-base text-ink">
          {lang === 'en' ? markQuotedVi(line) : line}
        </p>
      ))}
    </div>
  )
}

/** English copy quotes Vietnamese example words (“chừ”, “rứa”): mark them so screen readers read them as Vietnamese. */
function markQuotedVi(line: string): ReactNode[] {
  return line.split(/(“[^”]*”)/).map((part, i) =>
    part.startsWith('“') ? (
      <span key={i} lang="vi">
        {part}
      </span>
    ) : (
      part
    ),
  )
}
