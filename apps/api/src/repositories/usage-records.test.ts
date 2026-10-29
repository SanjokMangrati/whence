import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestUser } from '../test/factories'
import { listGenerationJobsForUser } from './generation-jobs'
import { insertReservedGenerationJob } from './generation-start'
import { countUsageForUserInPeriod, returnUsageRecordForFailedJob } from './usage-records'

const db = createDb(env.DB)
const PERIOD = '2030-01'

describe('usage record repository', () => {
  let owner: string
  let stranger: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
  })

  async function reserve(slot: number) {
    const jobId = crypto.randomUUID()
    const now = new Date()
    await insertReservedGenerationJob(
      db,
      {
        id: jobId,
        userId: owner,
        requestedUrl: 'https://example.com/article',
        outputType: 'notes',
        workflowInstanceId: jobId,
        createdAt: now,
        updatedAt: now,
      },
      { id: crypto.randomUUID(), userId: owner, period: PERIOD, slot, jobId, createdAt: now },
    )
    return jobId
  }

  it('counts the open slots of the owner only', async () => {
    await reserve(0)
    await reserve(1)

    expect(await countUsageForUserInPeriod(db, owner, PERIOD)).toBe(2)
    expect(await countUsageForUserInPeriod(db, stranger, PERIOD)).toBe(0)
  })

  it('refuses a taken slot and writes no job for it', async () => {
    await reserve(0)

    await expect(reserve(0)).rejects.toThrow(/UNIQUE constraint failed: usage_record/)
    expect(await listGenerationJobsForUser(db, owner)).toHaveLength(1)
  })

  it('frees the slot of a returned job', async () => {
    const jobId = await reserve(0)

    expect(await returnUsageRecordForFailedJob(db, { jobId, limit: 3, now: new Date() })).toBe(true)
    expect(await countUsageForUserInPeriod(db, owner, PERIOD)).toBe(0)
    await expect(reserve(0)).resolves.toBeTypeOf('string')
  })

  it('stops returning slots at the limit of the period', async () => {
    const first = await reserve(0)
    const second = await reserve(1)

    expect(
      await returnUsageRecordForFailedJob(db, { jobId: first, limit: 1, now: new Date() }),
    ).toBe(true)
    expect(
      await returnUsageRecordForFailedJob(db, { jobId: second, limit: 1, now: new Date() }),
    ).toBe(false)
    expect(await countUsageForUserInPeriod(db, owner, PERIOD)).toBe(1)
  })
})
