import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../db/client'
import { createPostHogErrorReporter } from '../providers/posthog/error-reporter'
import { storeProviderKey } from '../services/provider-keys'
import { messageStream } from '../test/anthropic'
import { insertTestJob, insertTestSource, insertTestUser } from '../test/factories'
import { stubFetch } from '../test/fetch'
import { generatorForJob } from './generator'

const db = createDb(env.DB)
const VISITOR_KEY = 'sk-ant-api03-visitor-key-for-tests-only-AbCd'
const SERVER_KEY = 'sk-ant-api03-server-key-for-tests-only-WxYz'
const REQUEST = { system: 's', prompt: 'p', maxOutputTokens: 1024 }

describe('generator for a job', () => {
  let jobId: string

  beforeEach(async () => {
    const userId = await insertTestUser(db)
    jobId = await insertTestJob(db, userId, await insertTestSource(db))
    await storeProviderKey(db, env.KEY_ENCRYPTION_SECRET, userId, VISITOR_KEY)
  })

  it('runs with the visitor key when the server has no key', async () => {
    const requests = stubFetch(() => messageStream('notes', 'end_turn'))

    const generator = await generatorForJob(env, db, jobId)
    await generator.generate(REQUEST)

    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${VISITOR_KEY}`)
    expect(await requests[0]!.json()).toMatchObject({ model: env.GENERATOR_MODEL_ID })
  })

  it('runs with the server key when the server has one', async () => {
    const requests = stubFetch(() => messageStream('notes', 'end_turn'))

    const generator = await generatorForJob({ ...env, ANTHROPIC_API_KEY: SERVER_KEY }, db, jobId)
    await generator.generate(REQUEST)

    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${SERVER_KEY}`)
  })

  it('keeps the visitor key out of the error and its report when Anthropic refuses it', async () => {
    stubFetch(() =>
      Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status: 401 },
      ),
    )
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const generator = await generatorForJob(env, db, jobId)
    const error = await generator.generate(REQUEST).catch((caught: unknown) => caught)
    await createPostHogErrorReporter({ apiKey: '', host: '' }).report(error, { where: 'test' })

    expect(error).toMatchObject({ code: 'provider_key_rejected' })
    expect(logged).toHaveBeenCalled()
    const output = logged.mock.calls
      .flat()
      .map((value) => (value instanceof Error ? `${value.message}\n${value.stack}` : String(value)))
      .join('\n')
    expect(output).not.toContain('visitor-key')
  })
})
