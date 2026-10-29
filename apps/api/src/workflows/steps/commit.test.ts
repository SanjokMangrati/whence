import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import { artifactCache, generationMetric } from '../../db/schema'
import type { ClaimVerifier } from '../../domain/ports'
import type { OutputType } from '../../domain/types'
import { listArtifactsByJob } from '../../repositories/artifacts'
import { artifactContentKey, getText } from '../../repositories/blobs'
import { listCitationsByOwner } from '../../repositories/citations'
import { findGenerationJobForUser } from '../../repositories/generation-jobs'
import { listQaItemsByJob } from '../../repositories/qa-items'
import { UNBOUNDED_BUDGET } from '../../services/spend-budget'
import { fakeGenerator } from '../../test/generator'
import {
  CHEAT_SHEET_JSON,
  NOTES_JSON,
  QA_JSON,
  draftsFrom,
  fakeVerifier,
  insertPipelineJob,
  supportsAll,
  type PipelineJob,
} from '../../test/pipeline'
import type { Measures } from '../metrics'
import { PROMPT_VERSION } from '../prompts'
import { commitGeneration } from './commit'
import { verifyDrafts } from './verify'

const db = createDb(env.DB)
const bucket = env.BUCKET

const MEASURES: Measures = {
  modelId: 'test-model',
  usage: { inputTokens: 300, outputTokens: 150, costUsd: 0.003 },
  stageDurationsMs: { generate: 12 },
  counts: {
    claimsGenerated: 3,
    claimsRejected: 1,
    claimsRewritten: 0,
    conceptsUnsupported: 0,
    conceptsRewritten: 0,
    stepsUnsupported: 0,
    stepsRewritten: 0,
    citationsInvalid: 0,
    verifierCalls: 4,
  },
}

const rejectsOneSitting = () => fakeVerifier((claim) => !claim.includes('one sitting'))

function notesWith(heading: string, entries: object[]) {
  return JSON.stringify({ sections: [{ heading, entries }] })
}

describe('commit step', () => {
  let job: PipelineJob

  const verified = async (
    answers: string[],
    verifier: ClaimVerifier = supportsAll(),
    outputType: OutputType = 'notes',
  ) => {
    await draftsFrom(job, answers, outputType)
    await verifyDrafts(
      {
        db,
        bucket,
        generator: fakeGenerator([JSON.stringify({ statements: [] })]),
        verifier,
        budget: UNBOUNDED_BUDGET,
      },
      job,
    )
  }

  const commit = () =>
    commitGeneration(
      { db, bucket },
      { ...job, configuredModelId: 'configured-model', measures: MEASURES },
    )

  const markdownOf = (artifactId: string) => getText(bucket, artifactContentKey(artifactId))

  beforeEach(async () => {
    job = await insertPipelineJob()
  })

  it('commits an artifact whose citations resolve to real spans', async () => {
    await verified([NOTES_JSON, QA_JSON], rejectsOneSitting())

    const committed = await commit()

    const artifactId = committed.artifactIds[0]!
    expect(await markdownOf(artifactId)).toBe(
      '# Spaced repetition\n\n## Why spacing works\n- Spreading reviews over time improves recall.[^1]',
    )
    const citations = await listCitationsByOwner(db, 'artifact', artifactId)
    expect(citations.map((row) => row.spanId)).toEqual([job.spanIds[0]])
    const [qaItem] = await listQaItemsByJob(db, job.jobId)
    const qaCitations = await listCitationsByOwner(db, 'qa_item', qaItem!.id)
    expect(qaCitations.map((row) => row.spanId)).toEqual([job.spanIds[1]])
    expect((await findGenerationJobForUser(db, job.userId, job.jobId))?.status).toBe('completed')
  })

  it('caches the outputs under the configured model', async () => {
    await verified([NOTES_JSON, QA_JSON])

    await commit()

    const rows = await db
      .select()
      .from(artifactCache)
      .where(eq(artifactCache.canonicalJobId, job.jobId))
    expect(rows.map((row) => row.outputType).sort()).toEqual(['notes', 'qa'])
    expect(rows.every((row) => row.modelId === 'configured-model')).toBe(true)
    expect(rows.every((row) => row.promptVersion === PROMPT_VERSION)).toBe(true)
  })

  it('writes nothing when the commit runs a second time', async () => {
    await verified([NOTES_JSON, QA_JSON])
    const committed = await commit()

    expect(await commit()).toEqual(committed)
    expect(await listArtifactsByJob(db, job.jobId)).toHaveLength(1)
    expect(await listQaItemsByJob(db, job.jobId)).toHaveLength(1)
    expect(
      await db.select().from(generationMetric).where(eq(generationMetric.jobId, job.jobId)),
    ).toHaveLength(1)
  })

  it('records the measures in one metric row', async () => {
    await verified([NOTES_JSON, QA_JSON])

    await commit()

    const [metric] = await db
      .select()
      .from(generationMetric)
      .where(eq(generationMetric.jobId, job.jobId))
    expect(metric).toMatchObject({
      modelId: 'test-model',
      promptVersion: PROMPT_VERSION,
      inputTokens: 300,
      outputTokens: 150,
      costUsd: 0.003,
      stageDurationsMs: '{"generate":12}',
      failureStage: null,
      ...MEASURES.counts,
    })
  })

  it('commits notes and a cheat sheet under headings', async () => {
    await verified(
      [NOTES_JSON, CHEAT_SHEET_JSON, QA_JSON],
      rejectsOneSitting(),
      'notes_and_cheat_sheet',
    )

    const committed = await commit()

    const [notes, cheatSheet] = await Promise.all(committed.artifactIds.map(markdownOf))
    expect(notes).toBe(
      '# Spaced repetition\n\n## Why spacing works\n- Spreading reviews over time improves recall.[^1]',
    )
    expect(cheatSheet).toBe(
      '# Spaced repetition\n\n## Review interval\n- Interval: grows after each successful review[^1]',
    )
  })

  it('commits each detail under its entry', async () => {
    await verified([
      notesWith('Why spacing works', [
        {
          text: 'Spreading reviews over time improves recall.',
          spans: [0],
          details: [1, 2].map((n) => ({ text: `The interval grows, case ${n}.`, spans: [1] })),
        },
      ]),
      QA_JSON,
    ])

    const committed = await commit()

    expect(await markdownOf(committed.artifactIds[0]!)).toBe(
      '# Spaced repetition\n\n## Why spacing works\n' +
        '- Spreading reviews over time improves recall.[^1]\n' +
        '  - The interval grows, case 1.[^2]\n' +
        '  - The interval grows, case 2.[^3]',
    )
  })

  it('commits a procedure as a numbered list apart from the entries around it', async () => {
    await verified([
      JSON.stringify({
        sections: [
          {
            heading: 'Scheduling reviews',
            entries: [
              { text: 'Spreading reviews over time improves recall.', spans: [0] },
              {
                steps: [
                  { text: 'Review the card.', spans: [0] },
                  { text: 'Grow the interval.', spans: [1] },
                ],
              },
            ],
          },
          {
            heading: 'Intervals',
            entries: [{ text: 'The interval grows after each review.', spans: [1] }],
          },
        ],
      }),
      QA_JSON,
    ])

    const committed = await commit()

    expect(await markdownOf(committed.artifactIds[0]!)).toBe(
      '# Spaced repetition\n\n## Scheduling reviews\n' +
        '- Spreading reviews over time improves recall.[^1]\n\n' +
        '1. Review the card.[^2]\n2. Grow the interval.[^3]\n\n' +
        '## Intervals\n- The interval grows after each review.[^4]',
    )
    const [artifact] = await listArtifactsByJob(db, job.jobId)
    expect(artifact?.entryCount).toBe(2)
  })

  it('commits a table with its row labels and escapes a pipe in a cell', async () => {
    await verified([
      notesWith('Review methods', [
        {
          table: {
            columns: ['Timing', 'Recall'],
            rows: [
              {
                label: 'Spaced',
                cells: [
                  { text: 'spread over time', spans: [0] },
                  { text: 'better', spans: [0] },
                ],
              },
              { label: 'Massed | crammed', cells: [{ text: 'one sitting', spans: [1] }, null] },
            ],
          },
        },
      ]),
      QA_JSON,
    ])

    const committed = await commit()

    expect(await markdownOf(committed.artifactIds[0]!)).toBe(
      '# Spaced repetition\n\n## Review methods\n\n' +
        '|  | Timing | Recall |\n| --- | --- | --- |\n' +
        '| Spaced | spread over time[^1] | better[^2] |\n' +
        '| Massed \\| crammed | one sitting[^3] |  |',
    )
  })
})
