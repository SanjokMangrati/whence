import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import { generationMetric } from '../../db/schema'
import type { ArtifactType } from '../../domain/types'
import type { CacheKey } from '../../repositories/artifact-cache'
import { findArtifactForUser, listArtifactsByJob } from '../../repositories/artifacts'
import { getText } from '../../repositories/blobs'
import { listCitationsByOwner } from '../../repositories/citations'
import type { CommittedIds } from '../../repositories/generation-commit'
import { findGenerationJobForUser } from '../../repositories/generation-jobs'
import {
  listQaItemsByJob,
  listQaItemsForUserJob,
  removeQaItemForUser,
} from '../../repositories/qa-items'
import { findSourceById } from '../../repositories/sources'
import { UNBOUNDED_BUDGET } from '../../services/spend-budget'
import { insertTestJob, insertTestUser } from '../../test/factories'
import { fakeGenerator } from '../../test/generator'
import {
  NOTES_JSON,
  QA_JSON,
  draftsFrom,
  insertPipelineJob,
  supportsAll,
  type PipelineJob,
} from '../../test/pipeline'
import { NO_COUNTS } from '../metrics'
import { PROMPT_VERSION } from '../prompts'
import { serveFromCache } from './cache'
import { commitGeneration } from './commit'
import { verifyDrafts } from './verify'

const db = createDb(env.DB)
const bucket = env.BUCKET

describe('cache step', () => {
  let author: PipelineJob
  let canonical: CommittedIds
  let key: CacheKey
  let readerId: string
  let readerJobId: string

  const serve = (artifactTypes: ArtifactType[] = ['notes'], cacheKey = key) =>
    serveFromCache(
      { db, bucket },
      {
        jobId: readerJobId,
        userId: readerId,
        key: cacheKey,
        artifactTypes,
        stageDurationsMs: { cache: 4 },
      },
    )

  beforeEach(async () => {
    author = await insertPipelineJob()
    await draftsFrom(author, [NOTES_JSON, QA_JSON])
    await verifyDrafts(
      {
        db,
        bucket,
        generator: fakeGenerator([]),
        verifier: supportsAll(),
        budget: UNBOUNDED_BUDGET,
      },
      author,
    )
    canonical = await commitGeneration(
      { db, bucket },
      {
        ...author,
        configuredModelId: 'test-model',
        measures: {
          modelId: 'test-model',
          usage: { inputTokens: 300, outputTokens: 150, costUsd: 0.003 },
          stageDurationsMs: {},
          counts: NO_COUNTS,
        },
      },
    )
    const source = await findSourceById(db, author.sourceId)
    key = {
      sourceId: author.sourceId,
      contentHash: source!.contentHash,
      promptVersion: PROMPT_VERSION,
      modelId: 'test-model',
    }
    readerId = await insertTestUser(db)
    readerJobId = await insertTestJob(db, readerId, author.sourceId)
  })

  it('copies the cached generation into rows the second user owns', async () => {
    const copied = await serve()

    const artifactId = copied!.artifactIds[0]!
    expect(artifactId).not.toBe(canonical.artifactIds[0])
    const copy = await findArtifactForUser(db, readerId, artifactId)
    const original = await findArtifactForUser(db, author.userId, canonical.artifactIds[0]!)
    expect(copy).toMatchObject({ userId: readerId, jobId: readerJobId })
    expect(copy!.contentR2Key).not.toBe(original!.contentR2Key)
    expect(await getText(bucket, copy!.contentR2Key)).toBe(
      await getText(bucket, original!.contentR2Key),
    )
    const citations = await listCitationsByOwner(db, 'artifact', artifactId)
    expect(citations.map((row) => [row.spanId, row.ordinal])).toEqual([
      [author.spanIds[0], 0],
      [author.spanIds[0], 1],
    ])
    const qaCitations = await listCitationsByOwner(db, 'qa_item', copied!.qaItemIds[0]!)
    expect(qaCitations.map((row) => row.spanId)).toEqual([author.spanIds[1]])
    expect((await findGenerationJobForUser(db, readerId, readerJobId))?.status).toBe('completed')
    expect(await listArtifactsByJob(db, author.jobId)).toHaveLength(1)
  })

  it('records a metric row that costs nothing', async () => {
    await serve()

    const [metric] = await db
      .select()
      .from(generationMetric)
      .where(eq(generationMetric.jobId, readerJobId))
    expect(metric).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      stageDurationsMs: '{"cache":4}',
    })
  })

  it('copies a question the first user removed, as not removed', async () => {
    const [question] = await listQaItemsByJob(db, author.jobId)
    await removeQaItemForUser(db, author.userId, question!.id, new Date())

    await serve()

    expect(await listQaItemsForUserJob(db, readerId, readerJobId)).toMatchObject([
      { question: question!.question, removedAt: null },
    ])
    expect(await listQaItemsForUserJob(db, author.userId, author.jobId)).toEqual([])
  })

  it('returns the first copy when the step runs a second time', async () => {
    const first = await serve()

    expect(await serve()).toEqual(first)
    expect(await listArtifactsByJob(db, readerJobId)).toHaveLength(1)
    expect(await listQaItemsByJob(db, readerJobId)).toHaveLength(1)
  })

  it('misses when the model id changes', async () => {
    expect(await serve(['notes'], { ...key, modelId: 'other-model' })).toBeNull()
  })

  it('misses when the job asks for an output the cache does not hold', async () => {
    expect(await serve(['notes', 'cheat_sheet'])).toBeNull()
  })
})
