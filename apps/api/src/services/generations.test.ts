import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { updateGenerationJobStage } from '../repositories/generation-jobs'
import { insertGenerationMetric } from '../repositories/generation-metrics'
import { saveReviewSchedule } from '../repositories/review-schedules'
import { returnUsageRecordForFailedJob } from '../repositories/usage-records'
import {
  insertTestArtifact,
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { metricRow, NO_COUNTS } from '../workflows/metrics'
import { deleteGeneration, listGenerations, readGenerationStatus } from './generations'
import { reserveSourceSlot } from './quota'

const db = createDb(env.DB)

describe('generations', () => {
  let ownerId: string
  let sourceId: string

  const insertUnlinkedJob = async (requestedUrl: string) => {
    const id = crypto.randomUUID()
    const now = new Date()
    await reserveSourceSlot(db, {
      plan: 'pro',
      now,
      job: {
        id,
        userId: ownerId,
        requestedUrl,
        outputType: 'notes',
        workflowInstanceId: id,
        createdAt: now,
        updatedAt: now,
      },
    })
    return id
  }

  beforeEach(async () => {
    ownerId = await insertTestUser(db)
    sourceId = await insertTestSource(db)
  })

  it('gives each job its notes count, question count, and next review', async () => {
    const jobId = await insertTestJob(db, ownerId, sourceId)
    await insertTestArtifact(db, { userId: ownerId, jobId, sourceId })
    const first = await insertTestQaItem(db, { userId: ownerId, jobId, sourceId })
    await insertTestQaItem(db, { userId: ownerId, jobId, sourceId })
    const dueAt = new Date('2030-02-01T00:00:00.000Z')
    await saveReviewSchedule(db, {
      id: crypto.randomUUID(),
      userId: ownerId,
      qaItemId: first,
      dueAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(await listGenerations(db, ownerId)).toMatchObject([
      { id: jobId, notes: 3, questions: 2, nextReviewAt: dueAt },
    ])
  })

  it('leaves the counts empty for a job with no output', async () => {
    const jobId = await insertTestJob(db, ownerId, sourceId)

    expect(await listGenerations(db, ownerId)).toMatchObject([
      { id: jobId, notes: null, questions: 0, nextReviewAt: null },
    ])
  })

  it('types a job with no source yet from the host of its URL', async () => {
    const article = await insertUnlinkedJob('https://example.com/watch?v=intro')
    const video = await insertUnlinkedJob('https://youtu.be/dQw4w9WgXcQ')

    const types = (await listGenerations(db, ownerId)).map((row) => [row.id, row.sourceType])

    expect(Object.fromEntries(types)).toEqual({ [article]: 'article', [video]: 'video' })
    expect(await readGenerationStatus(db, ownerId, video, false)).toMatchObject({
      sourceType: 'video',
      title: null,
    })
  })

  it('shows whether a failed job still holds its slot', async () => {
    const kept = await insertUnlinkedJob('https://example.com/kept')
    const returned = await insertUnlinkedJob('https://example.com/returned')
    for (const id of [kept, returned]) {
      await updateGenerationJobStage(db, id, { status: 'failed', updatedAt: new Date() })
    }
    await returnUsageRecordForFailedJob(db, { jobId: returned, limit: 3, now: new Date() })

    expect(await readGenerationStatus(db, ownerId, kept, false)).toMatchObject({
      countsTowardQuota: true,
    })
    expect(await readGenerationStatus(db, ownerId, returned, false)).toMatchObject({
      countsTowardQuota: false,
    })
  })

  it('shows the cost of a job only when the user key paid for it', async () => {
    const jobId = await insertTestJob(db, ownerId, sourceId)
    const unmeasured = await insertTestJob(db, ownerId, sourceId)
    await insertGenerationMetric(
      db,
      metricRow(
        jobId,
        {
          modelId: 'test-model',
          usage: { inputTokens: 1_000, outputTokens: 500, costUsd: 0.042 },
          stageDurationsMs: {},
          counts: NO_COUNTS,
        },
        new Date(),
      ),
    )

    expect(await readGenerationStatus(db, ownerId, jobId, true)).toMatchObject({ costUsd: 0.042 })
    expect(await readGenerationStatus(db, ownerId, jobId, false)).toMatchObject({ costUsd: null })
    expect(await readGenerationStatus(db, ownerId, unmeasured, true)).toMatchObject({
      costUsd: null,
    })
  })

  it('returns nothing to another user', async () => {
    const jobId = await insertTestJob(db, ownerId, sourceId)
    await insertTestQaItem(db, { userId: ownerId, jobId, sourceId })
    const strangerId = await insertTestUser(db)

    expect(await listGenerations(db, strangerId)).toEqual([])
    expect(await readGenerationStatus(db, strangerId, jobId, false)).toBeNull()
  })

  it('removes a job for its owner only', async () => {
    const jobId = await insertTestJob(db, ownerId, sourceId)
    const strangerId = await insertTestUser(db)

    expect(await deleteGeneration(db, strangerId, jobId)).toBe(false)
    expect(await deleteGeneration(db, ownerId, jobId)).toBe(true)
    expect(await listGenerations(db, ownerId)).toEqual([])
    expect(await readGenerationStatus(db, ownerId, jobId, false)).toBeNull()
  })
})
