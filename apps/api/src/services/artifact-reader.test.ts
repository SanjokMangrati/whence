import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestUser } from '../test/factories'
import { committedPipelineJob } from '../test/pipeline'
import { readArtifact, readJobSource, readQaItem } from './artifact-reader'

const deps = { db: createDb(env.DB), bucket: env.BUCKET }

describe('artifact reader', () => {
  let job: Awaited<ReturnType<typeof committedPipelineJob>>
  let strangerId: string

  beforeEach(async () => {
    job = await committedPipelineJob()
    strangerId = await insertTestUser(deps.db)
  })

  it('reads an artifact with each citation resolved to its source text', async () => {
    const view = await readArtifact(deps, job.userId, job.artifactIds[0]!)

    expect(view).toMatchObject({
      artifactType: 'notes',
      source: { id: job.sourceId, sourceType: 'article', title: 'Spaced repetition' },
      citations: [0, 1].map((ordinal) => ({
        ordinal,
        spanId: job.spanIds[0],
        spanOrdinal: 0,
        spanKind: 'text',
        startMs: null,
        text: 'Recall improves when reviews are spread over time.',
      })),
    })
    expect(view?.markdown).toContain('Reviews are best done in one sitting.[^2]')
  })

  it('reads the source text of a job as its spans', async () => {
    const view = await readJobSource(deps, job.userId, job.jobId)

    expect(view?.spans.map((span) => span.text)).toEqual([
      'Recall improves when reviews are spread over time.',
      'The interval grows after each successful review.',
    ])
  })

  it('reads the answer of a question with its citation', async () => {
    const view = await readQaItem(deps, job.userId, job.qaItemIds[0]!)

    expect(view).toMatchObject({
      answer: 'The interval grows after each successful review.',
      citations: [
        { spanId: job.spanIds[1], text: 'The interval grows after each successful review.' },
      ],
    })
  })

  it('returns nothing to another user', async () => {
    expect(await readArtifact(deps, strangerId, job.artifactIds[0]!)).toBeNull()
    expect(await readJobSource(deps, strangerId, job.jobId)).toBeNull()
    expect(await readQaItem(deps, strangerId, job.qaItemIds[0]!)).toBeNull()
  })
})
