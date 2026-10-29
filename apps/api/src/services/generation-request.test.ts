import { introspectWorkflow } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { utcMonthOf } from '../domain/usage'
import { findGenerationJobForUser } from '../repositories/generation-jobs'
import { countUsageForUserInPeriod } from '../repositories/usage-records'
import { insertTestJob, insertTestSource, insertTestUser } from '../test/factories'
import { startGeneration, type GenerationRequestDeps } from './generation-request'
import { storeProviderKey } from './provider-keys'

const db = createDb(env.DB)
const ARTICLE_URL = 'https://example.com/article'

function failingCreate(started: boolean): GenerationRequestDeps['workflow'] {
  const real = env.GENERATION_WORKFLOW
  return {
    create: async (options) => {
      if (started) await real.create(options)
      throw new Error('The create call timed out.')
    },
    get: (id) => real.get(id),
  }
}

describe('generation request', () => {
  let workflows: Awaited<ReturnType<typeof introspectWorkflow>>
  let userId: string

  const start = (deps: Partial<GenerationRequestDeps> = {}, url = ARTICLE_URL) =>
    startGeneration(
      {
        db,
        workflow: env.GENERATION_WORKFLOW,
        dailySourceLimit: 1000,
        userKeyRequired: false,
        ...deps,
      },
      { userId, url, outputType: 'notes' },
    )

  const usedSlots = () => countUsageForUserInPeriod(db, userId, utcMonthOf(new Date()))

  beforeEach(async () => {
    userId = await insertTestUser(db)
    workflows = await introspectWorkflow(env.GENERATION_WORKFLOW)
    await workflows.modifyAll(async (m) => {
      await m.disableRetryDelays()
      await m.mockStepError({ name: 'validate' }, new Error('Stopped by the test.'))
    })
  })

  afterEach(async () => {
    await workflows.dispose()
  })

  it('reserves a slot and starts one instance for the job', async () => {
    const { jobId } = await start()

    expect((await env.GENERATION_WORKFLOW.get(jobId)).id).toBe(jobId)
    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      requestedUrl: ARTICLE_URL,
      outputType: 'notes',
    })
    expect(await usedSlots()).toBe(1)
  })

  it('refuses an unsupported host before it reserves a slot', async () => {
    await expect(start({}, 'https://vimeo.com/123')).rejects.toMatchObject({
      code: 'unsupported_source',
    })
    expect(await usedSlots()).toBe(0)
  })

  it('refuses a user with no key when the server has none', async () => {
    await expect(start({ userKeyRequired: true })).rejects.toMatchObject({
      code: 'provider_key_required',
    })
    expect(await usedSlots()).toBe(0)

    await storeProviderKey(
      db,
      env.KEY_ENCRYPTION_SECRET,
      userId,
      'sk-ant-api03-visitor-key-for-tests-only-AbCd',
    )
    await expect(start({ userKeyRequired: true })).resolves.toHaveProperty('jobId')
  })

  it('refuses a free source after the daily limit for all users', async () => {
    await start()

    await expect(start({ dailySourceLimit: 1 })).rejects.toMatchObject({
      code: 'daily_limit_reached',
    })
  })

  it('refuses a fourth job while three are running', async () => {
    const sourceId = await insertTestSource(db)
    for (let running = 0; running < 3; running++) await insertTestJob(db, userId, sourceId)

    await expect(start()).rejects.toMatchObject({ code: 'too_many_running' })
  })

  it('refuses with the quota before the daily limit when no slot is left', async () => {
    for (let used = 0; used < 3; used++) await start()

    await expect(start({ dailySourceLimit: 0 })).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
  })

  it('keeps a job whose instance started before create failed', async () => {
    const { jobId } = await start({ workflow: failingCreate(true) })

    expect((await env.GENERATION_WORKFLOW.get(jobId)).id).toBe(jobId)
    expect(await usedSlots()).toBe(1)
  })

  it('fails the job and returns its slot when no instance started', async () => {
    await expect(start({ workflow: failingCreate(false) })).rejects.toThrow(
      'The create call timed out.',
    )
    expect(await usedSlots()).toBe(0)
  })
})
