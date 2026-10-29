import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import type { ClaimVerifier, Generator } from '../../domain/ports'
import { fakeGenerator } from '../../test/generator'
import {
  CONCEPTS_JSON,
  fakeVerifier,
  insertPipelineJob,
  readConcepts,
  supportsAll,
  type PipelineJob,
} from '../../test/pipeline'
import { checkConcepts } from './check-concepts'
import { extractConcepts } from './concepts'

const db = createDb(env.DB)
const bucket = env.BUCKET

const ASIDE = {
  statement: 'The author once forgot a whole lecture.',
  role: 'aside',
  topic: 'Spacing',
  spans: [0],
}

describe('concept check step', () => {
  let job: PipelineJob

  const extract = (answer: string) =>
    extractConcepts({ db, bucket, generator: fakeGenerator([answer]) }, job)
  const check = (generator: Generator, verifier: ClaimVerifier) =>
    checkConcepts({ db, bucket, generator, verifier }, job)

  beforeEach(async () => {
    job = await insertPipelineJob()
  })

  it('drops asides before the concept check', async () => {
    await extract(
      JSON.stringify({
        concepts: [
          ASIDE,
          {
            statement: 'The interval grows after each successful review.',
            role: 'principle',
            topic: 'Spacing',
            spans: [1],
          },
        ],
      }),
    )
    const verifier = supportsAll()

    await check(fakeGenerator([]), verifier)

    const checked = await readConcepts(job.jobId, 'checked')
    expect(checked.map((concept) => concept.statement)).toEqual([
      'The interval grows after each successful review.',
    ])
    expect(verifier.checks.map((input) => input.claim)).toEqual([
      'The interval grows after each successful review.',
    ])
  })

  it('fails when every concept is an aside', async () => {
    await extract(JSON.stringify({ concepts: [ASIDE] }))

    await expect(check(fakeGenerator([]), supportsAll())).rejects.toMatchObject({
      code: 'generation_failed',
    })
  })

  it('verifies each concept against its span and the spans next to it', async () => {
    await extract(CONCEPTS_JSON)
    const verifier = supportsAll()

    await check(fakeGenerator([]), verifier)

    expect(verifier.checks[0]).toEqual({
      claim: 'Spreading reviews over time improves recall.',
      evidence: [
        'Recall improves when reviews are spread over time. The interval grows after each successful review.',
      ],
    })
  })

  it('calls no generator when every concept is supported', async () => {
    await extract(CONCEPTS_JSON)

    const result = await check(fakeGenerator([]), supportsAll())

    expect(result).toMatchObject({ conceptsUnsupported: 0, conceptsRewritten: 0, verifierCalls: 2 })
    expect(await readConcepts(job.jobId, 'checked')).toEqual(
      await readConcepts(job.jobId, 'concepts'),
    )
  })

  it('replaces an unsupported concept only with a supported rewrite', async () => {
    await extract(
      JSON.stringify({
        concepts: [
          {
            statement: 'Spreading reviews over time doubles recall.',
            role: 'principle',
            topic: 'Spacing',
            spans: [0],
          },
          {
            statement: 'The interval grows after every review, even a failed one.',
            role: 'principle',
            topic: 'Spacing',
            spans: [1],
          },
        ],
      }),
    )
    const rewrites = JSON.stringify({
      concepts: [
        { id: 0, statement: 'Spreading reviews over time improves recall.' },
        { id: 1, statement: 'The interval grows after every review.' },
      ],
    })

    const result = await check(
      fakeGenerator([rewrites]),
      fakeVerifier((claim) => claim === 'Spreading reviews over time improves recall.'),
    )

    const checked = await readConcepts(job.jobId, 'checked')
    expect(checked.map((concept) => concept.statement)).toEqual([
      'Spreading reviews over time improves recall.',
      'The interval grows after every review, even a failed one.',
    ])
    expect(result).toMatchObject({ conceptsUnsupported: 2, conceptsRewritten: 1, verifierCalls: 4 })
  })

  it('fails when a rewrite names a concept it was not sent', async () => {
    await extract(CONCEPTS_JSON)
    const invented = JSON.stringify({ concepts: [{ id: 5, statement: 'Invented.' }] })

    await expect(
      check(
        fakeGenerator([invented]),
        fakeVerifier(() => false),
      ),
    ).rejects.toMatchObject({ code: 'generation_failed' })
  })
})
