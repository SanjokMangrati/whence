import type { ReactNode } from 'react'
import { PLANS, type Plan } from '@/lib/plans'

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No'
}

const ROWS: { label: string; value: (plan: Plan) => string }[] = [
  {
    label: 'Sources',
    value: (plan) =>
      PLANS[plan].quotaPeriod === 'month'
        ? `${PLANS[plan].sourcesPerPeriod}/mo`
        : `${PLANS[plan].sourcesPerPeriod} total`,
  },
  { label: 'Length per source', value: (plan) => `${PLANS[plan].minutesPerSource} min` },
  { label: 'Collections', value: (plan) => yesNo(PLANS[plan].collections) },
  { label: 'Export to PDF, Word, Markdown', value: (plan) => yesNo(PLANS[plan].export) },
]

export function PlanCard({
  plan: id,
  className = '',
  children,
}: {
  plan: Plan
  className?: string
  children: ReactNode
}) {
  const plan = PLANS[id]
  return (
    <div
      className={`grid content-start gap-6 rounded-md bg-card p-5 sm:p-7 ${id === 'pro' ? 'shadow-float' : 'border border-line'} ${className}`}
    >
      <div className="grid gap-2">
        <h3 className="mono-label text-ink-3">{plan.name}</h3>
        <p className="flex items-baseline gap-2">
          <span className="display-xl">${plan.dollarsPerMonth}</span>
          {plan.dollarsPerMonth > 0 && <span className="mono text-ink-3">/mo</span>}
        </p>
      </div>
      <dl className="border-b border-line">
        {ROWS.map((row) => {
          const value = row.value(id)
          return (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-t border-line py-3"
            >
              <dt className="ui-s text-ink-3">{row.label}</dt>
              <dd
                className={`text-right whitespace-nowrap ${value === 'No' || value === 'Yes' ? 'ui-m' : 'mono'} ${value === 'No' ? 'text-ink-3' : 'text-ink'}`}
              >
                {value}
              </dd>
            </div>
          )
        })}
      </dl>
      {children}
    </div>
  )
}
