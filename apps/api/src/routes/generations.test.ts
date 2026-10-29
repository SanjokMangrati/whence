import { introspectWorkflow, SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { storeProviderKey } from '../services/provider-keys'
import { reserveSourceSlot } from '../services/quota'
import { committedPipelineJob } from '../test/pipeline'
import { signUp } from '../test/session'

const db = createDb(env.DB)
const ARTICLE_URL = 'https://example.com/article'

function call(cookie: string, path: string, init: { method?: string; body?: unknown } = {}) {
  return SELF.fetch(`https://example.com/api${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function signUpWithKey() {
  const session = await signUp()
  await storeProviderKey(
    db,
    env.KEY_ENCRYPTION_SECRET,
    session.userId,
    'sk-ant-api03-visitor-key-for-tests-only-AbCd',
  )
  return session
}

const start = (cookie: string, url = ARTICLE_URL) =>
  call(cookie, '/generations', { method: 'POST', body: { url, outputType: 'notes' } })

describe('generation routes', () => {
  let workflows: Awaited<ReturnType<typeof introspectWorkflow>>

  beforeEach(async () => {
    workflows = await introspectWorkflow(env.GENERATION_WORKFLOW)
    await workflows.modifyAll(async (m) => {
      await m.disableRetryDelays()
      await m.mockStepError({ name: 'validate' }, new Error('Stopped by the test.'))
    })
  })

  afterEach(async () => {
    await workflows.dispose()
  })

  it('refuses a request with no session', async () => {
    const response = await SELF.fetch('https://example.com/api/generations', { method: 'POST' })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('refuses a body that is not a source request', async () => {
    const { cookie } = await signUpWithKey()

    for (const body of [
      {},
      { url: ARTICLE_URL },
      { url: ARTICLE_URL, outputType: 'summary' },
      { url: `https://example.com/${'a'.repeat(2048)}`, outputType: 'notes' },
    ]) {
      const response = await call(cookie, '/generations', { method: 'POST', body })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('refuses an unsupported host with its code', async () => {
    const { cookie } = await signUpWithKey()

    const response = await start(cookie, 'https://vimeo.com/12345')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'unsupported_source' })
  })

  it('asks for a key when the server has none', async () => {
    const { cookie } = await signUp()

    const response = await start(cookie)

    expect(response.status).toBe(402)
    expect(await response.json()).toEqual({ error: 'provider_key_required' })
  })

  it('starts a job and shows it to its owner only', async () => {
    const owner = await signUpWithKey()
    const stranger = await signUp()

    const response = await start(owner.cookie)
    const { jobId } = await response.json<{ jobId: string }>()

    expect(response.status).toBe(202)
    expect(await (await call(owner.cookie, `/generations/${jobId}`)).json()).toMatchObject({
      id: jobId,
      requestedUrl: ARTICLE_URL,
      sourceType: 'article',
    })
    expect(await (await call(owner.cookie, '/generations')).json()).toMatchObject({
      items: [{ id: jobId }],
    })
    expect((await call(stranger.cookie, `/generations/${jobId}`)).status).toBe(404)
    expect(await (await call(stranger.cookie, '/generations')).json()).toEqual({ items: [] })
  })

  it('refuses a source past the plan quota with its code', async () => {
    const { cookie, userId } = await signUpWithKey()
    const now = new Date()
    for (let used = 0; used < 3; used++) {
      const id = crypto.randomUUID()
      await reserveSourceSlot(db, {
        plan: 'free',
        now,
        job: {
          id,
          userId,
          requestedUrl: ARTICLE_URL,
          outputType: 'notes',
          workflowInstanceId: id,
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    const response = await start(cookie)

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'quota_exceeded' })
  })

  it('deletes a job for its owner only', async () => {
    const owner = await signUpWithKey()
    const stranger = await signUp()
    const { jobId } = await (await start(owner.cookie)).json<{ jobId: string }>()

    expect(
      (await call(stranger.cookie, `/generations/${jobId}`, { method: 'DELETE' })).status,
    ).toBe(404)
    expect((await call(owner.cookie, `/generations/${jobId}`, { method: 'DELETE' })).status).toBe(
      204,
    )
    expect((await call(owner.cookie, `/generations/${jobId}`)).status).toBe(404)
  })

  it('serves the source text and the artifact to the owner only', async () => {
    const owner = await signUp()
    const stranger = await signUp()
    const job = await committedPipelineJob(owner.userId)

    const source = await call(owner.cookie, `/generations/${job.jobId}/source`)
    const artifact = await call(owner.cookie, `/artifacts/${job.artifactIds[0]}`)

    expect(source.status).toBe(200)
    expect(await source.json()).toMatchObject({ source: { id: job.sourceId } })
    expect(artifact.status).toBe(200)
    expect(await artifact.json()).toMatchObject({ id: job.artifactIds[0], artifactType: 'notes' })
    expect((await call(stranger.cookie, `/generations/${job.jobId}/source`)).status).toBe(404)
    expect((await call(stranger.cookie, `/artifacts/${job.artifactIds[0]}`)).status).toBe(404)
  })
})
