import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { artifactContentKey, putText } from '../repositories/blobs'
import { upsertSubscription } from '../repositories/subscriptions'
import { committedPipelineJob } from '../test/pipeline'
import { signUp } from '../test/session'

const db = createDb(env.DB)

async function proUser() {
  const user = await signUp()
  await upsertSubscription(db, {
    id: crypto.randomUUID(),
    userId: user.userId,
    tier: 'pro',
    status: 'active',
    providerSubscriptionId: 'sub_1',
    lastEventAt: new Date(),
    updatedAt: new Date(),
  })
  return user
}

function exportRequest(cookie: string, artifactId: string, format: string) {
  return SELF.fetch(`https://example.com/api/artifacts/${artifactId}/export/${format}`, {
    headers: { cookie },
  })
}

describe('artifact export route', () => {
  it('refuses a free account at the endpoint', async () => {
    const { cookie, userId } = await signUp()
    const job = await committedPipelineJob(userId)

    for (const format of ['pdf', 'docx', 'md']) {
      const response = await exportRequest(cookie, job.artifactIds[0]!, format)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'entitlement_required' })
    }
  })

  it('sends the file as an attachment named after the source', async () => {
    const { cookie, userId } = await proUser()
    const job = await committedPipelineJob(userId)

    const response = await exportRequest(cookie, job.artifactIds[0]!, 'md')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="Spaced repetition - Notes.md"; filename*=UTF-8''Spaced%20repetition%20-%20Notes.md`,
    )
    expect(await response.text()).toContain('## Why spacing works')
  })

  it('refuses a PDF the fonts cannot draw with its code', async () => {
    const { cookie, userId } = await proUser()
    const job = await committedPipelineJob(userId)
    await putText(
      env.BUCKET,
      artifactContentKey(job.artifactIds[0]!),
      '- 間隔反復は記憶を強くする。[^1]',
    )

    const response = await exportRequest(cookie, job.artifactIds[0]!, 'pdf')

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'export_unsupported_text' })
  })

  it('exports nothing for another user or another format', async () => {
    const owner = await proUser()
    const stranger = await proUser()
    const job = await committedPipelineJob(owner.userId)

    expect((await exportRequest(stranger.cookie, job.artifactIds[0]!, 'pdf')).status).toBe(404)
    expect((await exportRequest(owner.cookie, job.artifactIds[0]!, 'txt')).status).toBe(404)
  })
})
