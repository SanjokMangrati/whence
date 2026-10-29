import type { QuotaPeriod } from '@/lib/plans'

const PERIOD: Record<QuotaPeriod, string> = {
  month: 'this month',
  account: 'in this account',
}

const SIZE = 32
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function UsageRing({
  used,
  limit,
  period,
}: {
  used: number
  limit: number
  period: QuotaPeriod
}) {
  const share = Math.min(1, used / limit)
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={used}
      aria-label={`Sources ${PERIOD[period]}`}
      aria-valuetext={`${used} of ${limit}`}
      title={`${used} of ${limit} sources ${PERIOD[period]}`}
      className="relative grid size-8 shrink-0 place-items-center"
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-8 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-line"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
          className="stroke-ink transition-[stroke-dashoffset] duration-320 ease-out"
        />
      </svg>
      <span
        aria-hidden="true"
        className="font-sans text-[10px] font-medium text-ink-2 tabular-nums"
      >
        {used}/{limit}
      </span>
    </span>
  )
}
