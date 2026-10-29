import { env } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { generationMetric } from '../db/schema'
import { DomainError, type DomainErrorCode } from '../domain/errors'
import { findGenerationJobForUser } from '../repositories/generation-jobs'
import { insertReservedGenerationJob } from '../repositories/generation-start'
import { countUsageForUserInPeriod } from '../repositories/usage-records'
import { insertTestUser } from '../test/factories'
import { permanentAware, recordFailure, toFailure } from './failure'
import { NO_COUNTS, type Measures } from './metrics'

const db = createDb(env.DB)
const PERIOD = '2030-01'

const MEASURES: Measures = {
  modelId: 'test-model',
  usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
  stageDurationsMs: { extract: 30 },
  counts: NO_COUNTS,
}

describe('failure classification', () => {
  it('stops a retry for a failure that repeats on every attempt', async () => {
    const error = await permanentAware(async () => {
      throw new DomainError('unsupported_source', 'vimeo.com is not a supported source.')
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(NonRetryableError)
    expect(toFailure(error)).toEqual({
      code: 'unsupported_source',
      message: 'vimeo.com is not a supported source.',
    })
  })

  it('lets a provider failure retry', async () => {
    const error = await permanentAware(async () => {
      throw new DomainError('verifier_request_failed', 'Jev returned 529.')
    }).catch((caught: unknown) => caught)

    expect(error).not.toBeInstanceOf(NonRetryableError)
    expect(toFailure(error)).toEqual({
      code: 'verifier_request_failed',
      message: 'Jev returned 529.',
    })
  })

  it('reads the code from a message that RPC prefixed with the error name', () => {
    const error = new Error('NonRetryableError: source_too_long: The source runs 75 minutes.')

    expect(toFailure(error)).toEqual({
      code: 'source_too_long',
      message: 'The source runs 75 minutes.',
    })
  })

  it('reports an unknown failure as a generation failure', () => {
    expect(toFailure(new Error('boom'))).toEqual({ code: 'generation_failed', message: 'boom' })
  })
})

describe('failure record', () => {
  let userId: string

  beforeEach(async () => {
    userId = await insertTestUser(db)
  })

  async function failJob(code: DomainErrorCode, slot: number) {
    const jobId = crypto.randomUUID()
    const now = new Date()
    await insertReservedGenerationJob(
      db,
      {
        id: jobId,
        userId,
        requestedUrl: 'https://example.com/article',
        outputType: 'notes',
        workflowInstanceId: jobId,
        createdAt: now,
        updatedAt: now,
      },
      { id: crypto.randomUUID(), userId, period: PERIOD, slot, jobId, createdAt: now },
    )
    await recordFailure(db, {
      jobId,
      plan: 'free',
      stage: 'generate',
      measures: MEASURES,
      error: new Error(`${code}: The step failed.`),
    })
    return jobId
  }

  it('marks the job failed with the code and message', async () => {
    const jobId = await failJob('generation_failed', 0)

    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      status: 'failed',
      stage: 'generate',
      errorCode: 'generation_failed',
      errorMessage: 'The step failed.',
    })
  })

  it('records the spend of the failed job with its stage', async () => {
    const jobId = await failJob('generation_failed', 0)

    const rows = await db.select().from(generationMetric).where(eq(generationMetric.jobId, jobId))
    expect(rows).toMatchObject([{ failureStage: 'generate', costUsd: 0.001 }])
  })

  it('returns failed sources up to the plan limit and keeps the slot after it', async () => {
    for (let slot = 0; slot < 4; slot++) await failJob('generation_failed', slot)

    expect(await countUsageForUserInPeriod(db, userId, PERIOD)).toBe(1)
  })

  it('frees the slot of a source rejected before any paid call without using a return', async () => {
    for (let slot = 0; slot < 3; slot++) await failJob('generation_failed', slot)

    await failJob('source_too_long', 3)

    expect(await countUsageForUserInPeriod(db, userId, PERIOD)).toBe(0)
  })
})
