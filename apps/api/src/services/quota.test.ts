import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import type { Plan } from 'entitlements'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { generationJob } from '../db/schema'
import type { NewGenerationJob } from '../repositories/generation-jobs'
import {
  countUsageForUserInPeriod,
  returnUsageRecordForFailedJob,
} from '../repositories/usage-records'
import { insertTestUser } from '../test/factories'
import { releaseSourceSlot, reserveSourceSlot } from './quota'

const db = createDb(env.DB)
const now = new Date('2030-03-14T10:00:00.000Z')

function newJob(userId: string): NewGenerationJob {
  const id = crypto.randomUUID()
  return {
    id,
    userId,
    requestedUrl: 'https://example.com/article',
    outputType: 'notes',
    workflowInstanceId: id,
    createdAt: now,
    updatedAt: now,
  }
}

async function countJobs(userId: string) {
  return (await db.select().from(generationJob).where(eq(generationJob.userId, userId))).length
}

describe('source quota', () => {
  let userId: string

  const reserve = async (plan: Plan = 'free', at = now) => {
    const job = newJob(userId)
    await reserveSourceSlot(db, { plan, now: at, job })
    return job.id
  }

  beforeEach(async () => {
    userId = await insertTestUser(db)
  })

  it('reserves three of ten concurrent requests on the free plan', async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserve()))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject(
      Array.from({ length: 7 }, () => ({ reason: { code: 'quota_exceeded' } })),
    )
    expect(await countUsageForUserInPeriod(db, userId, '2030-03')).toBe(3)
    expect(await countJobs(userId)).toBe(3)
  })

  it('counts a demo account over its life, not the month', async () => {
    for (let taken = 0; taken < 3; taken++) await reserve('demo')

    await expect(reserve('demo', new Date('2031-01-01T00:00:00.000Z'))).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    expect(await countUsageForUserInPeriod(db, userId, 'account')).toBe(3)
  })

  it('lets a released slot be reserved again', async () => {
    const released = await reserve()
    await reserve()
    await reserve()

    await releaseSourceSlot(db, released)
    await reserve()

    expect(await countUsageForUserInPeriod(db, userId, '2030-03')).toBe(3)
    expect(await countJobs(userId)).toBe(4)
  })

  it('lets the slot of a returned failure be reserved again', async () => {
    const failed = await reserve()
    await reserve()
    await reserve()

    await returnUsageRecordForFailedJob(db, { jobId: failed, limit: 3, now })
    await reserve()

    expect(await countUsageForUserInPeriod(db, userId, '2030-03')).toBe(3)
    expect(await countJobs(userId)).toBe(4)
  })
})
