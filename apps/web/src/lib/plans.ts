import { ENTITLEMENTS, type Plan, type QuotaPeriod } from 'entitlements'

export type { Plan, QuotaPeriod }

const MINUTE_MS = 60_000

function limitsOf(plan: Plan) {
  const entitlements = ENTITLEMENTS[plan]
  return {
    quotaPeriod: entitlements.quotaPeriod,
    sourcesPerPeriod: entitlements.sourcesPerPeriod,
    failedSourcesReturnedPerPeriod: entitlements.failedSourcesReturnedPerPeriod,
    minutesPerSource: entitlements.maxSourceLengthMs / MINUTE_MS,
    collections: entitlements.collections,
    export: entitlements.export,
  }
}

export const PLANS = {
  free: { name: 'Free', dollarsPerMonth: 0, ...limitsOf('free') },
  pro: { name: 'Pro', dollarsPerMonth: 12, ...limitsOf('pro') },
  demo: { name: 'Demo', dollarsPerMonth: 0, ...limitsOf('demo') },
} satisfies Record<Plan, { name: string; dollarsPerMonth: number }>

export const PRO_PRICE = `$${PLANS.pro.dollarsPerMonth}/mo`

export const PLAN_LIMIT: Record<Plan, string> = {
  free: `Free takes ${PLANS.free.sourcesPerPeriod} sources per month, up to ${PLANS.free.minutesPerSource} minutes each.`,
  pro: `Pro takes ${PLANS.pro.sourcesPerPeriod} sources per month, up to ${PLANS.pro.minutesPerSource} minutes each.`,
  demo: `The demo takes ${PLANS.demo.sourcesPerPeriod} sources in all, up to ${PLANS.demo.minutesPerSource} minutes each.`,
}
