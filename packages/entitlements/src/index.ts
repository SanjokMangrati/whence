export type Plan = 'free' | 'pro' | 'demo'

export type PaidPlan = Extract<Plan, 'pro'>

export type QuotaPeriod = 'month' | 'account'

export interface Entitlements {
  quotaPeriod: QuotaPeriod
  sourcesPerPeriod: number
  failedSourcesReturnedPerPeriod: number
  maxSourceLengthMs: number
  collections: boolean
  export: boolean
}

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    quotaPeriod: 'month',
    sourcesPerPeriod: 3,
    failedSourcesReturnedPerPeriod: 3,
    maxSourceLengthMs: 30 * 60 * 1000,
    collections: false,
    export: false,
  },
  pro: {
    quotaPeriod: 'month',
    sourcesPerPeriod: 20,
    failedSourcesReturnedPerPeriod: 20,
    maxSourceLengthMs: 90 * 60 * 1000,
    collections: true,
    export: true,
  },
  demo: {
    quotaPeriod: 'account',
    sourcesPerPeriod: 3,
    failedSourcesReturnedPerPeriod: 3,
    maxSourceLengthMs: 30 * 60 * 1000,
    collections: true,
    export: true,
  },
}
