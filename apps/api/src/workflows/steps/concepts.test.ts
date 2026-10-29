import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import { fakeGenerator } from '../../test/generator'
import {
  CONCEPTS_JSON,
  insertPipelineJob,
  readConcepts,
  type PipelineJob,
} from '../../test/pipeline'
import { extractConcepts } from './concepts'

const db = createDb(env.DB)
const bucket = env.BUCKET

function conceptsAnswer(
  concepts: { statement: string; role: string; spans: number[]; shows?: number[] }[],
) {
  return JSON.stringify({ concepts: concepts.map((concept) => ({ topic: 'Spacing', ...concept })) })
}

describe('concept step', () => {
  let job: PipelineJob
  const run = (answer: string) =>
    extractConcepts({ db, bucket, generator: fakeGenerator([answer]) }, job)

  beforeEach(async () => {
    job = await insertPipelineJob()
  })

  it('ties every concept to the spans that support it', async () => {
    await run(CONCEPTS_JSON)

    const concepts = await readConcepts(job.jobId, 'concepts')
    expect(concepts.map((concept) => [concept.role, concept.spanIds])).toEqual([
      ['principle', [job.spanIds[0]]],
      ['principle', [job.spanIds[1]]],
    ])
  })

  it('fails instead of cutting the concepts when the model lists more than the limit', async () => {
    const tooMany = conceptsAnswer(
      Array.from({ length: 41 }, (_, index) => ({
        statement: `Concept ${index} is stated in the source.`,
        role: 'principle',
        spans: [0],
      })),
    )

    await expect(run(tooMany)).rejects.toMatchObject({ code: 'generation_failed' })
  })

  it('removes a concept that cites a span the source does not have', async () => {
    const result = await run(
      conceptsAnswer([
        {
          statement: 'Spreading reviews over time improves recall.',
          role: 'principle',
          spans: [0],
        },
        { statement: 'Invented.', role: 'principle', spans: [1, 99] },
      ]),
    )

    const kept = await readConcepts(job.jobId, 'concepts')
    expect(kept.map((concept) => concept.statement)).toEqual([
      'Spreading reviews over time improves recall.',
    ])
    expect(result.citationsInvalid).toBe(1)
  })

  it('links a case only to a kept principle', async () => {
    await run(
      conceptsAnswer([
        { statement: 'Spacing improves recall.', role: 'principle', shows: [1], spans: [0] },
        {
          statement: 'A student spaced reviews.',
          role: 'example',
          shows: [0, 2, 9, 3, 0],
          spans: [1],
        },
        { statement: 'A student crammed.', role: 'example', spans: [1] },
        { statement: 'Invented.', role: 'principle', spans: [99] },
      ]),
    )

    const kept = await readConcepts(job.jobId, 'concepts')
    expect(kept.map((concept) => concept.showsPrincipleIds)).toEqual([[], [kept[0]!.id], []])
  })

  it('fails when every concept cites a span the source does not have', async () => {
    await expect(
      run(conceptsAnswer([{ statement: 'Invented.', role: 'principle', spans: [99] }])),
    ).rejects.toMatchObject({ code: 'generation_failed' })
  })
})
