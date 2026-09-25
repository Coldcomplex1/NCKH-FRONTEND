import { useShallow } from 'zustand/react/shallow'
import { RotateCw } from 'lucide-react'
import { LIGHT_COLORS } from '@/core/colors'
import { useDict } from '@/i18n'
import { useDemo } from '@/store/demoStore'
import { robotDict } from '../dict'
import { StageButton } from '../StageButton'

export type FallbackReason = 'no-webgl' | 'error' | 'lost'

/**
 * 2D stand-in when WebGL2 is missing or the 3D scene failed: a static SVG of Ronaldo in the room
 * (lamp and fan reflect the room state) plus one line saying what the robot is doing. Commands,
 * replies, cards and timers keep working (the engine runs without a body).
 */
export function Robot2D({ reason, onRetry }: { reason: FallbackReason; onRetry?: () => void }) {
  const t = useDict(robotDict)
  const { robot, room, running } = useDemo(
    useShallow((s) => ({ robot: s.robot, room: s.room, running: s.run?.status === 'running' })),
  )

  let doing: string
  if (robot.posture !== 'standing') doing = t.posture[robot.posture]
  else if (robot.activity !== 'idle') doing = t.activity[robot.activity]
  else doing = running ? t.working : t.activity.idle

  const note = reason === 'no-webgl' ? t.noWebgl : reason === 'lost' ? t.lost : t.error
  const short = reason === 'no-webgl' ? t.noWebglShort : reason === 'lost' ? t.lostShort : t.errorShort
  const lower =
    robot.posture === 'sitting' || robot.posture === 'sleeping' ? 22 : robot.posture === 'lying' ? 40 : 0
  const lightHex = LIGHT_COLORS[room.light.color].hex
  const lightOn = room.light.on
  const eyesClosed = robot.posture === 'sleeping' || robot.posture === 'lying'

  return (
    <div className="absolute inset-0">
      {/* Between the demo's bubble (top) and room chips (bottom-left), like the 3D robot. */}
      <div className="absolute inset-x-3 top-[27%] bottom-[29%] flex flex-col items-center justify-center gap-2 @lg:top-[22%] @lg:bottom-[24%]">
        <svg
          viewBox="0 4 320 226"
          className="min-h-0 w-full max-w-md flex-1"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${t.doing(doing)}. ${lightOn ? t.lightOn : t.lightOff}. ${
            room.fan.on ? t.fanOn(room.fan.speed) : t.fanOff
          }.`}
        >
          {/* floor */}
          <ellipse cx="160" cy="214" rx="150" ry="18" className="fill-surface-2" />
          {/* lamp */}
          <g transform="translate(46 0)">
            {lightOn ? (
              <circle cx="0" cy="92" r="46" fill={lightHex} opacity={room.light.dimmed ? 0.18 : 0.35} />
            ) : null}
            <rect x="-2.5" y="96" width="5" height="112" rx="2.5" className="fill-primary" />
            <ellipse cx="0" cy="210" rx="20" ry="5" className="fill-primary" />
            <path
              d="M-14 72 L14 72 L26 100 L-26 100 Z"
              className="fill-sun-soft stroke-line-strong"
              strokeWidth="2"
            />
            <circle cx="0" cy="100" r="7" fill={lightOn ? lightHex : 'var(--line)'} />
          </g>
          {/* fan */}
          <g transform="translate(272 0)">
            <rect x="-2.5" y="118" width="5" height="88" rx="2.5" className="fill-series-2" />
            <ellipse
              cx="0"
              cy="208"
              rx="18"
              ry="6"
              className="fill-surface stroke-line-strong"
              strokeWidth="2"
            />
            <circle cx="8" cy="207" r="3" fill={room.fan.on ? '#34C759' : 'var(--line-strong)'} />
            <circle cx="0" cy="108" r="26" className="fill-surface stroke-series-2" strokeWidth="3" />
            {[0, 120, 240].map((a) => (
              <ellipse
                key={a}
                cx="0"
                cy="-12"
                rx="6"
                ry="12"
                transform={`translate(0 108) rotate(${a})`}
                className="fill-series-2"
                opacity="0.7"
              />
            ))}
            <circle cx="0" cy="108" r="4" className="fill-series-2" />
          </g>
          {/* robot */}
          <g transform={`translate(160 ${lower})`}>
            <ellipse cx="0" cy="212" rx="44" ry="7" className="fill-line" opacity="0.8" />
            {/* legs */}
            <rect x="-24" y="160" width="16" height="48" rx="8" className="fill-muted" />
            <rect x="8" y="160" width="16" height="48" rx="8" className="fill-muted" />
            {/* arms */}
            <rect
              x="-54"
              y="112"
              width="16"
              height="50"
              rx="8"
              className="fill-sun"
              transform="rotate(12 -46 112)"
            />
            <rect
              x="38"
              y="112"
              width="16"
              height="50"
              rx="8"
              className="fill-sun"
              transform="rotate(-12 46 112)"
            />
            {/* body */}
            <rect
              x="-40"
              y="104"
              width="80"
              height="66"
              rx="22"
              className="fill-sun stroke-ink"
              strokeWidth="2"
            />
            <circle cx="0" cy="136" r="9" className="fill-primary-soft stroke-ink" strokeWidth="1.5" />
            {/* head */}
            <line
              x1="0"
              y1="34"
              x2="0"
              y2="18"
              className="stroke-ink"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="0" cy="15" r="6" className="fill-accent" />
            <rect
              x="-46"
              y="34"
              width="92"
              height="70"
              rx="26"
              className="fill-sun stroke-ink"
              strokeWidth="2"
            />
            <rect x="-34" y="48" width="68" height="40" rx="16" className="fill-ink" />
            {eyesClosed ? (
              <>
                <path
                  d="M-22 68 q8 6 16 0"
                  className="stroke-white"
                  strokeWidth="3.5"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M6 68 q8 6 16 0"
                  className="stroke-white"
                  strokeWidth="3.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <circle cx="-14" cy="66" r="6.5" className="fill-white" />
                <circle cx="14" cy="66" r="6.5" className="fill-white" />
              </>
            )}
            <Mouth expression={robot.expression} />
          </g>
        </svg>
        <div className="max-w-xl rounded-2xl bg-surface/90 px-4 py-2 text-center shadow-soft">
          <p className="font-semibold text-ink @lg:text-lg">{t.doing(doing)}</p>
          <p className="text-sm text-muted">
            <span className="@lg:hidden">{short}</span>
            <span className="hidden @lg:inline">{note}</span>
          </p>
        </div>
      </div>
      {onRetry ? (
        <div className="absolute right-3 bottom-3 sm:right-4 sm:bottom-4">
          <StageButton
            label={reason === 'lost' ? t.reload : t.retry}
            icon={<RotateCw className="size-5" />}
            onClick={onRetry}
          />
        </div>
      ) : null}
    </div>
  )
}

function Mouth({ expression }: { expression: string | null }) {
  if (expression === 'Surprised') return <circle cx="0" cy="81" r="4" className="fill-white" />
  if (expression === 'Sad')
    return (
      <path
        d="M-8 84 q8 -6 16 0"
        className="stroke-white"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    )
  if (expression === 'Angry')
    return <path d="M-8 82 h16" className="stroke-white" strokeWidth="3" fill="none" strokeLinecap="round" />
  return (
    <path d="M-8 79 q8 6 16 0" className="stroke-white" strokeWidth="3" fill="none" strokeLinecap="round" />
  )
}
