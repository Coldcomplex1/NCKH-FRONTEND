import { Fan, Lightbulb, LightbulbOff } from 'lucide-react'
import { LIGHT_COLORS } from '@/core/colors'
import { useDict, useLang } from '@/i18n'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'

const chip =
  'inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-surface px-3 text-sm font-semibold text-ink shadow-pop'

/** Small chips showing the simulated smart home: light on/off + colour, fan on/off + speed. */
export function RoomStatus() {
  const room = useDemo((s) => s.room)
  const lang = useLang()
  const t = useDict(demoDict).room
  const color = LIGHT_COLORS[room.light.color]

  return (
    <ul aria-label={t.label} className="pointer-events-auto flex flex-wrap gap-2">
      <li className={chip}>
        {room.light.on ? (
          <Lightbulb aria-hidden="true" className="size-5 text-accent-ink" />
        ) : (
          <LightbulbOff aria-hidden="true" className="size-5 text-muted" />
        )}
        <span>
          {t.light}: {room.light.on ? t.on : t.off}
        </span>
        {room.light.on ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full border-2 border-ink"
              style={{ backgroundColor: color.hex }}
            />
            <span>
              {color.name[lang]}
              {room.light.dimmed ? ` · ${t.dimmed}` : ''}
            </span>
          </>
        ) : null}
      </li>
      <li className={chip}>
        <Fan
          aria-hidden="true"
          className={cn('size-5', room.fan.on ? 'text-primary motion-safe:animate-spin' : 'text-muted')}
          style={room.fan.on ? { animationDuration: `${1.6 / room.fan.speed}s` } : undefined}
        />
        <span>
          {t.fan}: {room.fan.on ? `${t.on} · ${t.speed(room.fan.speed)}` : t.off}
        </span>
      </li>
    </ul>
  )
}
