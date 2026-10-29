import { useId } from 'react'
import { daysFromToday, shortDate } from '@/lib/format'
import { clamp } from '@/lib/in-view'

const WIDTH = 1000
const MARGIN = 60
const BASELINE = 200
const MAX_RISE = 170
const LABEL_GAP = 170
const TODAY_LABEL_END = 150

export function Journey({ dates, progress }: { dates: Date[]; progress?: number }) {
  const id = useId()
  const days = dates.map(daysFromToday)
  const lastDay = Math.max(1, ...days)
  const x = (day: number) => MARGIN + (day * (WIDTH - 2 * MARGIN)) / lastDay
  const points = [0, ...days].map(x)
  const drawn = progress === undefined ? dates.length : progress * dates.length
  const pending = (point: number) => (drawn < point ? true : undefined)

  const labelled = new Set<number>()
  let leftmost = Infinity
  for (let index = dates.length - 1; index >= 0; index--) {
    const at = points[index + 1]!
    if (leftmost - at >= LABEL_GAP && at >= TODAY_LABEL_END + LABEL_GAP / 2) {
      labelled.add(index)
      leftmost = at
    }
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} 260`}
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      className="journey block h-auto w-full overflow-visible"
    >
      <title id={`${id}-title`}>Your next reviews</title>
      <desc id={`${id}-desc`}>
        Reviews on {dates.map((date) => shortDate(date)).join(', ')}, if you remember each time.
      </desc>
      <line className="axis" x1={MARGIN} y1={BASELINE} x2={WIDTH - MARGIN} y2={BASELINE} />
      {points.slice(1).map((end, index) => {
        const start = points[index]!
        const rise = Math.min(30 + (end - start) * 0.6, MAX_RISE)
        return (
          <path
            key={index}
            className="arc"
            pathLength={1}
            style={
              progress === undefined
                ? { animationDelay: `${index * 40}ms` }
                : {
                    animation: 'none',
                    strokeDashoffset: 1 - clamp(drawn - index),
                  }
            }
            d={`M${start} ${BASELINE} Q${(start + end) / 2} ${BASELINE - rise} ${end} ${BASELINE}`}
          />
        )
      })}
      {points.map((at, index) => (
        <circle
          key={index}
          className={index === 0 ? 'point-today' : 'point'}
          data-pending={pending(index)}
          cx={at}
          cy={BASELINE}
          r="7"
        />
      ))}
      <text className="date date-today" x={MARGIN - 20} y="246" textAnchor="start">
        TODAY
      </text>
      {dates.map(
        (date, index) =>
          labelled.has(index) && (
            <text
              key={date.toISOString()}
              className="date"
              data-pending={pending(index + 1)}
              x={index === dates.length - 1 ? WIDTH - MARGIN + 20 : points[index + 1]}
              y="246"
              textAnchor={index === dates.length - 1 ? 'end' : 'middle'}
            >
              {shortDate(date)}
            </text>
          ),
      )}
    </svg>
  )
}
