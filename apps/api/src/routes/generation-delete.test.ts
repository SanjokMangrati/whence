import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  artifact,
  artifactCache,
  citation,
  collectionItem,
  generationJob,
  generationMetric,
  qaItem,
  reviewSchedule,
} from '../db/schema'
import { addCollectionItems, insertCollection } from '../repositories/collections'
import { findCommittedGeneration } from '../repositories/generation-commit'
import { findSourceById } from '../repositories/sources'
import { insertTestJob } from '../test/factories'
import { commitPipelineJob, committedPipelineJob, insertPipelineJob } from '../test/pipeline'
import { signUp } from '../test/session'
import { serveFromCache } from '../workflows/steps/cache'
import { PROMPT_VERSION } from '../workflows/prompts'

const db = createDb(env.DB)

type Job = Awaited<ReturnType<typeof committedPipelineJob>>

function call(cookie: string, path: string, init: { method?: string; body?: unknown } = {}) {
  return SELF.fetch(`https://example.com/api${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

const remove = (cookie: string, jobId: string) =>
  call(cookie, `/generations/${jobId}`, { method: 'DELETE' })

async function rowsOf(job: Job) {
  const ownerIds = [...job.artifactIds, ...job.qaItemIds]
  const [jobs, artifacts, questions, citations, cacheEntries, schedules, items, metrics] =
    await Promise.all([
      db.select().from(generationJob).where(eq(generationJob.id, job.jobId)),
      db.select().from(artifact).where(eq(artifact.jobId, job.jobId)),
      db.select().from(qaItem).where(eq(qaItem.jobId, job.jobId)),
      db.select().from(citation).where(inArray(citation.ownerId, ownerIds)),
      db.select().from(artifactCache).where(eq(artifactCache.canonicalJobId, job.jobId)),
      db.select().from(reviewSchedule).where(inArray(reviewSchedule.qaItemId, job.qaItemIds)),
      db.select().from(collectionItem).where(inArray(collectionItem.artifactId, job.artifactIds)),
      db.select().from(generationMetric).where(eq(generationMetric.jobId, job.jobId)),
    ])
  return { jobs, artifacts, questions, citations, cacheEntries, schedules, items, metrics }
}

describe('generation deletion', () => {
  let owner: Awaited<ReturnType<typeof signUp>>
  let deleted: Job
  let kept: Job

  beforeEach(async () => {
    owner = await signUp()
    deleted = await committedPipelineJob(owner.userId)
    kept = await committedPipelineJob(owner.userId)
    const collectionId = crypto.randomUUID()
    const now = new Date()
    await insertCollection(db, {
      id: collectionId,
      userId: owner.userId,
      name: 'Memory',
      createdAt: now,
      updatedAt: now,
    })
    await addCollectionItems(
      db,
      [deleted, kept].map((job) => ({
        id: crypto.randomUUID(),
        collectionId,
        artifactId: job.artifactIds[0]!,
        createdAt: now,
      })),
    )
    for (const job of [deleted, kept]) {
      const rated = await call(owner.cookie, `/study/questions/${job.qaItemIds[0]}/rating`, {
        method: 'POST',
        body: { rating: 'good' },
      })
      expect(rated.status).toBe(200)
    }
  })

  it('hides the job from its owner and keeps the rows the cache copies', async () => {
    expect((await remove(owner.cookie, deleted.jobId)).status).toBe(204)

    const rows = await rowsOf(deleted)
    expect(rows.jobs).toMatchObject([{ deletedAt: expect.any(Date) }])
    expect(rows.artifacts).toHaveLength(1)
    expect(rows.questions).toHaveLength(1)
    expect(rows.citations).toHaveLength(3)
    expect(rows.cacheEntries).toHaveLength(2)
    expect(rows.metrics).toHaveLength(1)
    expect(rows.schedules).toEqual([])
    expect(rows.items).toEqual([])

    const list = await (
      await call(owner.cookie, '/generations')
    ).json<{ items: { id: string }[] }>()
    expect(list.items.map((item) => item.id)).toEqual([kept.jobId])
    for (const path of [
      `/generations/${deleted.jobId}`,
      `/generations/${deleted.jobId}/source`,
      `/artifacts/${deleted.artifactIds[0]}`,
      `/study/jobs/${deleted.jobId}/questions`,
      `/study/questions/${deleted.qaItemIds[0]}/answer`,
    ]) {
      expect({ path, status: (await call(owner.cookie, path)).status }).toEqual({
        path,
        status: 404,
      })
    }
    const rating = await call(owner.cookie, `/study/questions/${deleted.qaItemIds[0]}/rating`, {
      method: 'POST',
      body: { rating: 'good' },
    })
    expect(rating.status).toBe(404)
    const removal = await call(owner.cookie, `/study/questions/${deleted.qaItemIds[0]}`, {
      method: 'DELETE',
    })
    expect(removal.status).toBe(404)
    expect(await rowsOf(deleted)).toMatchObject({
      schedules: [],
      questions: [{ removedAt: null }],
    })

    const other = await rowsOf(kept)
    expect(other.jobs).toMatchObject([{ deletedAt: null }])
    expect(other.schedules).toHaveLength(1)
    expect(other.items).toHaveLength(1)
    expect((await call(owner.cookie, `/artifacts/${kept.artifactIds[0]}`)).status).toBe(200)
  })

  it('keeps the first deletion time when the owner deletes again', async () => {
    await remove(owner.cookie, deleted.jobId)
    const [first] = (await rowsOf(deleted)).jobs

    expect((await remove(owner.cookie, deleted.jobId)).status).toBe(204)
    expect((await rowsOf(deleted)).jobs[0]?.deletedAt).toEqual(first?.deletedAt)
  })

  it('serves the deleted job from the cache to another user', async () => {
    await remove(owner.cookie, deleted.jobId)
    const reader = await signUp()
    const readerJobId = await insertTestJob(db, reader.userId, deleted.sourceId)
    const source = await findSourceById(db, deleted.sourceId)

    const copied = await serveFromCache(
      { db, bucket: env.BUCKET },
      {
        jobId: readerJobId,
        userId: reader.userId,
        key: {
          sourceId: deleted.sourceId,
          contentHash: source!.contentHash,
          promptVersion: PROMPT_VERSION,
          modelId: 'test-model',
        },
        artifactTypes: ['notes'],
        stageDurationsMs: {},
      },
    )

    expect(copied?.qaItemIds).toHaveLength(1)
    const response = await call(reader.cookie, `/artifacts/${copied?.artifactIds[0]}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ artifactType: 'notes' })
  })

  it('refuses the job id of another user', async () => {
    const stranger = await signUp()

    expect((await remove(stranger.cookie, deleted.jobId)).status).toBe(404)
    expect(await rowsOf(deleted)).toMatchObject({
      jobs: [{ deletedAt: null }],
      schedules: [expect.anything()],
      items: [expect.anything()],
    })
  })

  it('commits a job deleted while it runs and keeps it hidden', async () => {
    const running = await insertPipelineJob(owner.userId)
    expect((await remove(owner.cookie, running.jobId)).status).toBe(204)

    const committed = await commitPipelineJob(running)

    const rows = await rowsOf(committed)
    expect(rows.jobs).toMatchObject([{ status: 'completed', deletedAt: expect.any(Date) }])
    expect(rows.cacheEntries).toHaveLength(2)
    expect(await findCommittedGeneration(db, owner.userId, running.jobId)).toEqual({
      artifactIds: committed.artifactIds,
      qaItemIds: committed.qaItemIds,
    })
    expect((await call(owner.cookie, `/artifacts/${committed.artifactIds[0]}`)).status).toBe(404)
  })
})
