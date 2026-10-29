import { introspectWorkflowInstance } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { generationMetric, usageRecord } from '../db/schema'
import type { OutputType } from '../domain/types'
import { listArtifactsByJob } from '../repositories/artifacts'
import { getText } from '../repositories/blobs'
import { findGenerationJobForUser } from '../repositories/generation-jobs'
import { insertReservedGenerationJob } from '../repositories/generation-start'
import { listQaItemsByJob } from '../repositories/qa-items'
import { storeProviderKey } from '../services/provider-keys'
import { messageStream } from '../test/anthropic'
import { insertTestUser } from '../test/factories'
import { stubFetch } from '../test/fetch'
import { ARTICLE_HTML, CONCEPTS_JSON, NOTES_JSON, QA_JSON } from '../test/pipeline'

const db = createDb(env.DB)
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const publicAddress = () => Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] })

function modelAnswer(body: string) {
  if (body.includes('Extract the concepts a student must learn')) return CONCEPTS_JSON
  if (body.includes('Write study notes')) return NOTES_JSON
  if (body.includes('Write active-recall questions')) return QA_JSON
  throw new Error('The test has no answer for this model request.')
}

function stubProviders(article: () => Response = () => htmlResponse(ARTICLE_HTML)) {
  return stubFetch(async (request) => {
    const host = new URL(request.url).hostname
    if (host === 'cloudflare-dns.com') return publicAddress()
    if (host === 'api.anthropic.com') {
      return messageStream(modelAnswer(await request.text()), 'end_turn', {
        input_tokens: 1000,
        output_tokens: 200,
      })
    }
    if (host === 'api.typesafe.ai') {
      return Response.json({
        model: 'jev-1.13.0',
        answers: { supported: { noul: 0.99 } },
        usage: { input_tokens: 20, output_tokens: 0 },
      })
    }
    if (host === 'example.com') return article()
    throw new Error(`The test does not serve ${request.url}.`)
  })
}

function htmlResponse(html: string) {
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

describe('generation workflow', () => {
  let userId: string
  let jobId: string
  let articleUrl: string

  beforeEach(async () => {
    userId = await insertTestUser(db)
    await storeProviderKey(db, env.KEY_ENCRYPTION_SECRET, userId, 'sk-ant-test-key')
    articleUrl = `https://example.com/post/${crypto.randomUUID()}`
  })

  async function start(requestedUrl: string, outputType: OutputType = 'notes') {
    jobId = crypto.randomUUID()
    const now = new Date()
    await insertReservedGenerationJob(
      db,
      {
        id: jobId,
        userId,
        requestedUrl,
        outputType,
        workflowInstanceId: jobId,
        createdAt: now,
        updatedAt: now,
      },
      { id: crypto.randomUUID(), userId, period: '2030-01', slot: 0, jobId, createdAt: now },
    )
    return { jobId, userId, requestedUrl, outputType, plan: 'free' as const }
  }

  async function slotsOf(id: string) {
    return db.select().from(usageRecord).where(eq(usageRecord.jobId, id))
  }

  it('turns an article URL into committed notes and questions', async () => {
    stubProviders()
    const params = await start(articleUrl)

    await using instance = await introspectWorkflowInstance(env.GENERATION_WORKFLOW, jobId)
    await env.GENERATION_WORKFLOW.create({ id: jobId, params })
    await instance.waitForStatus('complete')

    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      status: 'completed',
      stage: 'commit',
    })
    const [notes] = await listArtifactsByJob(db, jobId)
    expect(await getText(env.BUCKET, notes!.contentR2Key)).toContain(
      '## Why spacing works\n- Spreading reviews over time improves recall.[^1]',
    )
    expect(await listQaItemsByJob(db, jobId)).toHaveLength(1)
    const [metric] = await db
      .select()
      .from(generationMetric)
      .where(eq(generationMetric.jobId, jobId))
    expect(metric).toMatchObject({ failureStage: null, inputTokens: 3100, claimsGenerated: 3 })
  })

  it('leaves no artifact row when verification fails', async () => {
    stubProviders()
    const params = await start(articleUrl)

    await using instance = await introspectWorkflowInstance(env.GENERATION_WORKFLOW, jobId)
    await instance.modify(async (m) => {
      await m.mockStepResult(
        { name: 'verify' },
        {
          value: {
            claimsGenerated: 3,
            claimsRejected: 3,
            citationsInvalid: 0,
            claimsRewritten: 0,
            stepsUnsupported: 0,
            stepsRewritten: 0,
            verifierCalls: 3,
            usage: { inputTokens: 60, outputTokens: 0, costUsd: 0 },
            unsupported: 'No question is supported by the source.',
          },
          durationMs: 5,
        },
      )
    })
    await env.GENERATION_WORKFLOW.create({ id: jobId, params })
    await instance.waitForStatus('errored')

    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      status: 'failed',
      stage: 'verify',
      errorCode: 'verification_failed',
    })
    expect(await listArtifactsByJob(db, jobId)).toEqual([])
    expect(await listQaItemsByJob(db, jobId)).toEqual([])
    expect(await slotsOf(jobId)).toMatchObject([{ returnedAt: expect.any(Date) }])
  })

  it('stops an over-length video after one metadata request', async () => {
    const requests = stubFetch((request) => {
      const host = new URL(request.url).hostname
      if (host === 'cloudflare-dns.com') return publicAddress()
      if (host === 'www.googleapis.com') {
        return Response.json({
          items: [
            {
              snippet: { title: 'Long video', liveBroadcastContent: 'none' },
              contentDetails: { duration: 'PT1H15M' },
            },
          ],
        })
      }
      throw new Error(`The test does not serve ${request.url}.`)
    })
    const params = await start(VIDEO_URL)

    await using instance = await introspectWorkflowInstance(env.GENERATION_WORKFLOW, jobId)
    await env.GENERATION_WORKFLOW.create({ id: jobId, params })
    await instance.waitForStatus('errored')

    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      status: 'failed',
      stage: 'extract',
      errorCode: 'source_too_long',
    })
    expect(
      requests.filter((request) => !request.url.startsWith('https://cloudflare-dns.com')),
    ).toHaveLength(1)
    expect(await slotsOf(jobId)).toEqual([])
  })

  it('retries a failed source request and returns the slot', async () => {
    const requests = stubProviders(() => new Response('Down.', { status: 503 }))
    const params = await start(articleUrl)

    await using instance = await introspectWorkflowInstance(env.GENERATION_WORKFLOW, jobId)
    await instance.modify(async (m) => {
      await m.disableRetryDelays()
    })
    await env.GENERATION_WORKFLOW.create({ id: jobId, params })
    await instance.waitForStatus('errored')

    expect(await findGenerationJobForUser(db, userId, jobId)).toMatchObject({
      status: 'failed',
      errorCode: 'extraction_failed',
    })
    expect(requests.filter((request) => request.url === articleUrl)).toHaveLength(3)
    expect(await slotsOf(jobId)).toMatchObject([{ returnedAt: expect.any(Date) }])
  })
})
