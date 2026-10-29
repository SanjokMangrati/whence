import { ENTITLEMENTS, type Entitlements, type Plan } from 'entitlements'
import type { Database } from '../db/client'
import { PlanError } from '../domain/errors'
import { findPlanStateForUser } from '../repositories/subscriptions'
import { countUsageForUserInPeriod } from '../repositories/usage-records'
import { usagePeriodOf } from './quota'

export async function resolvePlan(db: Database, userId: string): Promise<Plan> {
  const state = await findPlanStateForUser(db, userId)
  if (state?.status === 'active' && state.tier !== null) return state.tier
  return state?.isAnonymous ? 'demo' : 'free'
}

export async function readPlanUsage(db: Database, userId: string, now: Date) {
  const plan = await resolvePlan(db, userId)
  const entitlements = ENTITLEMENTS[plan]
  return {
    plan,
    quotaPeriod: entitlements.quotaPeriod,
    sourcesUsed: await countUsageForUserInPeriod(db, userId, usagePeriodOf(plan, now)),
    sourcesPerPeriod: entitlements.sourcesPerPeriod,
  }
}

export type Capability = {
  [Key in keyof Entitlements]: Entitlements[Key] extends boolean ? Key : never
}[keyof Entitlements]

export function requireEntitlement(plan: Plan, capability: Capability) {
  if (!ENTITLEMENTS[plan][capability]) {
    throw new PlanError('entitlement_required', `The ${plan} plan does not include ${capability}.`)
  }
}
