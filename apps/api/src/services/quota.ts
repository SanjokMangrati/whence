import { ENTITLEMENTS, type Plan } from 'entitlements'
import type { Database } from '../db/client'
import { FREE_FAILURE_CODES, PlanError } from '../domain/errors'
import { utcDayOf, utcMonthOf } from '../domain/usage'
import { countSpendingJobsBetween, type NewGenerationJob } from '../repositories/generation-jobs'
import { insertReservedGenerationJob } from '../repositories/generation-start'
import { countUsageForUserInPeriod, deleteUsageRecordForJob } from '../repositories/usage-records'

export function usagePeriodOf(plan: Plan, now: Date) {
  return ENTITLEMENTS[plan].quotaPeriod === 'account' ? 'account' : utcMonthOf(now)
}

export async function hasSourceSlotLeft(db: Database, userId: string, plan: Plan, now: Date) {
  const used = await countUsageForUserInPeriod(db, userId, usagePeriodOf(plan, now))
  return used < ENTITLEMENTS[plan].sourcesPerPeriod
}

export async function reserveSourceSlot(
  db: Database,
  input: { plan: Plan; job: NewGenerationJob; now: Date },
) {
  const limit = ENTITLEMENTS[input.plan].sourcesPerPeriod
  const period = usagePeriodOf(input.plan, input.now)
  const used = await countUsageForUserInPeriod(db, input.job.userId, period)

  for (let attempt = 0; used < limit && attempt < limit; attempt++) {
    try {
      await insertReservedGenerationJob(db, input.job, {
        id: crypto.randomUUID(),
        userId: input.job.userId,
        period,
        slot: (used + attempt) % limit,
        jobId: input.job.id,
        createdAt: input.now,
      })
      return
    } catch (error) {
      if (!isSlotTaken(error)) throw error
    }
  }

  throw new PlanError('quota_exceeded', `The plan allows ${limit} sources.`)
}

export async function releaseSourceSlot(db: Database, jobId: string) {
  await deleteUsageRecordForJob(db, jobId)
}

export async function hasFreeSourceLeftToday(db: Database, dailyLimit: number, now: Date) {
  return (await countSpendingJobsBetween(db, utcDayOf(now), FREE_FAILURE_CODES)) < dailyLimit
}

function isSlotTaken(error: unknown) {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: usage_record')
}
