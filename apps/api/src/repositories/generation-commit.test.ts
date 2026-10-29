import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestJob, insertTestUser } from '../test/factories'
import { listCitationsByOwner } from './citations'
import { findCommittedGeneration, insertCommittedGeneration } from './generation-commit'
import { findGenerationJobForUser } from './generation-jobs'
import { insertSourceWithSpans } from './sources'

const db = createDb(env.DB)

describe('generation commit', () => {
  let owner: string
  let stranger: string
  let sourceId: string
  let spanId: string
  let jobId: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    sourceId = crypto.randomUUID()
    spanId = crypto.randomUUID()
    await insertSourceWithSpans(
      db,
      {
        id: sourceId,
        url: `https://example.com/${sourceId}`,
        normalizedUrl: `https://example.com/${sourceId}`,
        sourceType: 'article',
        contentHash: `hash-${sourceId}`,
        r2Key: `sources/${sourceId}.txt`,
        createdAt: new Date(),
      },
      [{ id: spanId, sourceId, ordinal: 0, charStart: 0, charEnd: 10, textHash: 'hash' }],
    )
    jobId = await insertTestJob(db, owner, sourceId)
  })

  async function commit() {
    const artifactId = crypto.randomUUID()
    const now = new Date()
    await insertCommittedGeneration(db, {
      jobId,
      artifacts: [
        {
          id: artifactId,
          userId: owner,
          jobId,
          sourceId,
          artifactType: 'notes',
          promptVersion: 'v1',
          modelId: 'test-model',
          contentR2Key: `artifacts/${artifactId}.md`,
          entryCount: 60,
          createdAt: now,
        },
      ],
      qaItems: [],
      citations: Array.from({ length: 60 }, (_, ordinal) => ({
        id: crypto.randomUUID(),
        ownerType: 'artifact' as const,
        ownerId: artifactId,
        spanId,
        ordinal,
        createdAt: now,
      })),
      metric: {
        id: crypto.randomUUID(),
        jobId,
        modelId: 'test-model',
        promptVersion: 'v1',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.002,
        stageDurationsMs: '{}',
        claimsGenerated: 60,
        claimsRejected: 0,
        createdAt: now,
      },
      cacheEntries: [],
      completedAt: now,
    })
    return artifactId
  }

  it('completes the job with every citation in one batch', async () => {
    const artifactId = await commit()

    expect((await findGenerationJobForUser(db, owner, jobId))?.status).toBe('completed')
    expect(await listCitationsByOwner(db, 'artifact', artifactId)).toHaveLength(60)
    expect(await findCommittedGeneration(db, owner, jobId)).toEqual({
      artifactIds: [artifactId],
      qaItemIds: [],
    })
  })

  it('returns nothing for a foreign user id', async () => {
    await commit()
    expect(await findCommittedGeneration(db, stranger, jobId)).toBeNull()
  })
})
