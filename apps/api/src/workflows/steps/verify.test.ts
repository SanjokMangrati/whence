import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import type { ClaimVerifier, Generator } from '../../domain/ports'
import { getJson, jobStepKey } from '../../repositories/blobs'
import { UNBOUNDED_BUDGET } from '../../services/spend-budget'
import { fakeGenerator } from '../../test/generator'
import {
  NOTES_JSON,
  QA_JSON,
  draftsFrom,
  fakeVerifier,
  insertPipelineJob,
  readDrafts,
  supportsAll,
  type PipelineJob,
} from '../../test/pipeline'
import { claimsOf } from '../drafts'
import { MAX_CLAIM_REWRITES, MAX_VERIFIER_CALLS } from '../prompts'
import { verifyDrafts } from './verify'

const db = createDb(env.DB)
const bucket = env.BUCKET

const rejects = (...parts: string[]) =>
  fakeVerifier((claim) => !parts.some((part) => claim.includes(part)))

const rewritesNothing = () => fakeGenerator([JSON.stringify({ statements: [] })])

function notesWith(entries: object[], heading = 'Why spacing works') {
  return JSON.stringify({ sections: [{ heading, entries }] })
}

const ONE_SITTING_NOTES = notesWith([
  {
    text: 'Reviews are best done in one sitting.',
    spans: [0],
    details: [{ text: 'The interval grows after each successful review.', spans: [1] }],
  },
])

const PROCEDURE_NOTES = notesWith(
  [
    { text: 'Spreading reviews over time improves recall.', spans: [0] },
    {
      steps: [
        { text: 'Review the card.', spans: [0] },
        { text: 'Wait one sitting.', spans: [1] },
        { text: 'Review it again.', spans: [1] },
      ],
    },
  ],
  'Scheduling reviews',
)

const TABLE_NOTES = notesWith(
  [
    { text: 'Spreading reviews over time improves recall.', spans: [0] },
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
          { label: 'Massed', cells: [{ text: 'one sitting', spans: [1] }, null] },
        ],
      },
    },
  ],
  'Review methods',
)

function notesWithClaims(count: number) {
  return notesWith(
    Array.from({ length: count }, (_, index) => ({ text: `Claim ${index}.`, spans: [index % 2] })),
    'Many claims',
  )
}

describe('verify step', () => {
  let job: PipelineJob

  const verify = (generator: Generator, verifier: ClaimVerifier) =>
    verifyDrafts({ db, bucket, generator, verifier, budget: UNBOUNDED_BUDGET }, job)
  const verifiedEntries = async () =>
    (await readDrafts(job.jobId, 'verified')).artifacts[0]!.sections.flatMap(
      (section) => section.entries,
    )
  const verifiedTexts = async () =>
    (await verifiedEntries()).flatMap(claimsOf).map((claim) => claim.text)

  beforeEach(async () => {
    job = await insertPipelineJob()
  })

  it('discards an unsupported claim and keeps the supported one', async () => {
    await draftsFrom(job, [NOTES_JSON, QA_JSON])

    const result = await verify(rewritesNothing(), rejects('one sitting'))

    expect(result).toMatchObject({ claimsGenerated: 3, claimsRejected: 1, unsupported: null })
    expect(await verifiedTexts()).toEqual(['Spreading reviews over time improves recall.'])
  })

  it('keeps the cited spans of a supported claim', async () => {
    await draftsFrom(job, [NOTES_JSON, QA_JSON])

    await verify(fakeGenerator([]), supportsAll())

    expect((await verifiedEntries()).flatMap(claimsOf)[0]!.spanIds).toEqual([job.spanIds[0]])
  })

  it('verifies a Q&A answer together with its question', async () => {
    await draftsFrom(job, [NOTES_JSON, QA_JSON])
    const verifier = supportsAll()

    await verify(fakeGenerator([]), verifier)

    expect(verifier.checks.find((input) => input.claim.startsWith('The interval'))).toMatchObject({
      question: 'What happens to the interval after a successful review?',
    })
  })

  it('records every verdict and every rejected claim', async () => {
    await draftsFrom(job, [NOTES_JSON, QA_JSON])

    await verify(rewritesNothing(), rejects('one sitting'))

    const verdicts = await getJson<{ claim: string; verdict: string }[]>(
      bucket,
      jobStepKey(job.jobId, 'verdicts'),
    )
    const rejected = await getJson<{ claim: string }[]>(bucket, jobStepKey(job.jobId, 'rejected'))
    expect(verdicts).toHaveLength(3)
    expect(rejected.map((claim) => claim.claim)).toEqual(['Reviews are best done in one sitting.'])
  })

  it('drops an unsupported detail, and keeps a supported detail when its point is unsupported', async () => {
    await draftsFrom(job, [
      notesWith([
        {
          text: 'Spreading reviews over time improves recall.',
          spans: [0],
          details: [{ text: 'Invented detail.', spans: [0] }],
        },
        {
          text: 'Reviews are best done in one sitting.',
          spans: [0],
          details: [{ text: 'The interval grows after each successful review.', spans: [1] }],
        },
      ]),
      QA_JSON,
    ])

    const result = await verify(rewritesNothing(), rejects('one sitting', 'Invented'))

    expect(result).toMatchObject({ claimsGenerated: 5, claimsRejected: 2 })
    expect(await verifiedEntries()).toEqual([
      {
        kind: 'claim',
        claim: { text: 'Spreading reviews over time improves recall.', spanIds: [job.spanIds[0]] },
        details: [],
      },
      {
        kind: 'claim',
        claim: {
          text: 'The interval grows after each successful review.',
          spanIds: [job.spanIds[1]],
        },
        details: [],
      },
    ])
  })

  it('replaces an unsupported point with a supported rewrite and keeps its details', async () => {
    await draftsFrom(job, [ONE_SITTING_NOTES, QA_JSON])
    const generator = fakeGenerator([
      JSON.stringify({
        statements: [{ id: 0, statement: 'Spreading reviews over time improves recall.' }],
      }),
    ])

    const result = await verify(generator, rejects('one sitting'))

    expect(generator.requests).toHaveLength(1)
    expect(generator.requests[0]!.prompt).toContain(
      '[0] Kind: notes point, one or two full sentences that name their subject\n' +
        'Context: Section: Why spacing works.\n' +
        'Statement: Reviews are best done in one sitting.',
    )
    expect(result).toMatchObject({ claimsGenerated: 3, claimsRejected: 0, claimsRewritten: 1 })
    expect(await verifiedEntries()).toEqual([
      {
        kind: 'claim',
        claim: { text: 'Spreading reviews over time improves recall.', spanIds: [job.spanIds[0]] },
        details: [
          {
            text: 'The interval grows after each successful review.',
            spanIds: [job.spanIds[1]],
          },
        ],
      },
    ])
  })

  it('removes a point whose rewrite is unsupported too, and keeps its details as points', async () => {
    await draftsFrom(job, [ONE_SITTING_NOTES, QA_JSON])
    const generator = fakeGenerator([
      JSON.stringify({ statements: [{ id: 0, statement: 'Reviews work best in one sitting.' }] }),
    ])

    const result = await verify(generator, rejects('one sitting'))

    expect(result).toMatchObject({ claimsRejected: 1, claimsRewritten: 0 })
    expect(await verifiedTexts()).toEqual(['The interval grows after each successful review.'])
  })

  it('replaces an unsupported answer with a supported rewrite and keeps its question', async () => {
    const qa = JSON.stringify({
      items: [
        {
          question: 'What happens to the interval after a successful review?',
          answer: 'The interval grows because the card is easy.',
          spans: [1],
        },
      ],
    })
    await draftsFrom(job, [NOTES_JSON, qa])
    const generator = fakeGenerator([
      JSON.stringify({
        statements: [{ id: 1, statement: 'The interval grows after each successful review.' }],
      }),
    ])

    const result = await verify(generator, rejects('because', 'one sitting'))

    expect(generator.requests[0]!.prompt).toContain(
      '[1] Kind: answer to the question, one or two sentences of at most 25 words\n' +
        'Context: Question: What happens to the interval after a successful review?\n' +
        'Statement: The interval grows because the card is easy.',
    )
    expect(result).toMatchObject({ claimsRewritten: 1 })
    expect((await readDrafts(job.jobId, 'verified')).qaItems).toEqual([
      {
        question: 'What happens to the interval after a successful review?',
        answer: 'The interval grows after each successful review.',
        spanIds: [job.spanIds[1]],
      },
    ])
  })

  it('verifies a detail with its heading and point as its subject', async () => {
    await draftsFrom(job, [
      notesWith([
        {
          text: 'Spreading reviews over time improves recall.',
          spans: [0],
          details: [{ text: 'It grows after each successful review.', spans: [1] }],
        },
      ]),
      QA_JSON,
    ])
    const verifier = supportsAll()

    await verify(fakeGenerator([]), verifier)

    const subjectOf = (start: string) =>
      verifier.checks.find((input) => input.claim.startsWith(start))?.subject
    expect(subjectOf('It grows')).toBe(
      'Why spacing works. Spreading reviews over time improves recall.',
    )
    expect(subjectOf('Spreading')).toBeUndefined()
  })

  it('verifies each step with only its section as its subject', async () => {
    await draftsFrom(job, [PROCEDURE_NOTES, QA_JSON])
    const verifier = supportsAll()

    await verify(fakeGenerator([]), verifier)

    for (const step of ['Review the card.', 'Wait one sitting.', 'Review it again.']) {
      expect(verifier.checks.find((input) => input.claim === step)?.subject).toBe(
        'Section: Scheduling reviews.',
      )
    }
  })

  it('keeps a procedure when a supported rewrite replaces its unsupported step', async () => {
    await draftsFrom(job, [PROCEDURE_NOTES, QA_JSON])
    const generator = fakeGenerator([
      JSON.stringify({ steps: [{ id: 0, statement: 'Wait until later.' }] }),
    ])

    const result = await verify(generator, rejects('one sitting'))

    expect(generator.requests).toHaveLength(1)
    expect(generator.requests[0]!.prompt).toContain('Step: Wait one sitting.')
    expect(generator.requests[0]!.prompt).toContain(
      'Walkthrough: Section: Scheduling reviews. First step: Review the card.',
    )
    expect(result).toMatchObject({ claimsRejected: 0, stepsUnsupported: 1, stepsRewritten: 1 })
    expect(await verifiedTexts()).toEqual([
      'Spreading reviews over time improves recall.',
      'Review the card.',
      'Wait until later.',
      'Review it again.',
    ])
  })

  it('drops a procedure when the rewrite of its unsupported step is unsupported too', async () => {
    await draftsFrom(job, [PROCEDURE_NOTES, QA_JSON])
    const generator = fakeGenerator([
      JSON.stringify({ steps: [{ id: 0, statement: 'Wait one sitting or more.' }] }),
    ])

    const result = await verify(generator, rejects('one sitting'))

    expect(result).toMatchObject({ claimsGenerated: 5, claimsRejected: 3, stepsRewritten: 0 })
    expect(await verifiedTexts()).toEqual(['Spreading reviews over time improves recall.'])
  })

  it('drops a procedure when the rewrite of its unsupported step is null', async () => {
    await draftsFrom(job, [PROCEDURE_NOTES, QA_JSON])
    const generator = fakeGenerator([JSON.stringify({ steps: [{ id: 0, statement: null }] })])

    const result = await verify(generator, rejects('one sitting'))

    expect(result).toMatchObject({ claimsRejected: 3, stepsUnsupported: 1, stepsRewritten: 0 })
    expect(await verifiedTexts()).toEqual(['Spreading reviews over time improves recall.'])
  })

  it('checks each table cell with its row and column', async () => {
    await draftsFrom(job, [TABLE_NOTES, QA_JSON])
    const verifier = supportsAll()

    await verify(fakeGenerator([]), verifier)

    const claims = verifier.checks.map((input) => input.claim)
    expect(claims).toContain('For Spaced, Timing: spread over time')
    expect(claims).toContain('For Massed, Timing: one sitting')
  })

  it('removes a table that no longer compares 2 things on 2 attributes', async () => {
    await draftsFrom(job, [TABLE_NOTES, QA_JSON])

    const result = await verify(fakeGenerator([]), rejects('one sitting'))

    expect(result).toMatchObject({ claimsGenerated: 5, claimsRejected: 3 })
    expect((await verifiedEntries()).map((entry) => entry.kind)).toEqual(['claim'])
  })

  it('rejects only the detail that cites a span the source does not have', async () => {
    await draftsFrom(job, [
      notesWith([
        {
          text: 'Spreading reviews over time improves recall.',
          spans: [0],
          details: [
            { text: 'The interval grows after each successful review.', spans: [1] },
            { text: 'Invented detail.', spans: [1, 99] },
          ],
        },
      ]),
      QA_JSON,
    ])
    const verifier = supportsAll()

    const result = await verify(fakeGenerator([]), verifier)

    expect(verifier.checks.map((input) => input.claim)).not.toContain('Invented detail.')
    expect(result).toMatchObject({ claimsGenerated: 4, claimsRejected: 1, citationsInvalid: 1 })
    expect(await verifiedTexts()).toEqual([
      'Spreading reviews over time improves recall.',
      'The interval grows after each successful review.',
    ])
    expect(await getJson(bucket, jobStepKey(job.jobId, 'rejected'))).toEqual([
      {
        claim: 'Invented detail.',
        subject: 'Why spacing works. Spreading reviews over time improves recall.',
        invalidSpans: [99],
      },
    ])
  })

  it('drops a procedure when one of its steps cites a span the source does not have', async () => {
    await draftsFrom(job, [
      notesWith(
        [
          { text: 'Spreading reviews over time improves recall.', spans: [0] },
          {
            steps: [
              { text: 'Review the card.', spans: [0] },
              { text: 'Grow the interval.', spans: [99] },
            ],
          },
        ],
        'Scheduling reviews',
      ),
      QA_JSON,
    ])

    const result = await verify(fakeGenerator([]), supportsAll())

    expect(result).toMatchObject({ claimsGenerated: 4, claimsRejected: 2, citationsInvalid: 1 })
    expect(await verifiedTexts()).toEqual(['Spreading reviews over time improves recall.'])
  })

  it('reports no supported entry and writes no verified drafts', async () => {
    await draftsFrom(job, [notesWith([{ text: 'Invented.', spans: [99] }], 'Invented'), QA_JSON])

    const result = await verify(fakeGenerator([]), supportsAll())

    expect(result.unsupported).toBe('No notes entry is supported by the source.')
    expect(await bucket.head(jobStepKey(job.jobId, 'verified'))).toBeNull()
  })

  it('reports no supported question', async () => {
    await draftsFrom(job, [NOTES_JSON, QA_JSON])

    const result = await verify(rewritesNothing(), rejects('The interval grows'))

    expect(result.unsupported).toBe('No question is supported by the source.')
  })

  it('drops a question that cites a span the source does not have', async () => {
    const qa = JSON.stringify({
      items: [
        {
          question: 'What happens to the interval after a successful review?',
          answer: 'The interval grows after each successful review.',
          spans: [1],
        },
        { question: 'Invented?', answer: 'Invented.', spans: [99] },
      ],
    })
    await draftsFrom(job, [NOTES_JSON, qa])

    const result = await verify(fakeGenerator([]), supportsAll())

    expect(result).toMatchObject({ citationsInvalid: 1 })
    expect((await readDrafts(job.jobId, 'verified')).qaItems.map((item) => item.question)).toEqual([
      'What happens to the interval after a successful review?',
    ])
  })

  it('fails before any verifier call when the drafts need more calls than the bound', async () => {
    await draftsFrom(job, [
      notesWithClaims(MAX_VERIFIER_CALLS - 1 - MAX_CLAIM_REWRITES + 1),
      QA_JSON,
    ])
    const verifier = supportsAll()

    await expect(verify(fakeGenerator([]), verifier)).rejects.toMatchObject({
      code: 'too_many_claims',
    })
    expect(verifier.checks).toHaveLength(0)
  })

  it('verifies drafts that need exactly the bound of verifier calls', async () => {
    await draftsFrom(job, [notesWithClaims(MAX_VERIFIER_CALLS - 1 - MAX_CLAIM_REWRITES), QA_JSON])
    const keepsOneClaim = fakeVerifier(
      (claim) => !claim.startsWith('Claim ') || claim === 'Claim 0.',
    )
    const failedRewrites = JSON.stringify({
      statements: Array.from({ length: MAX_CLAIM_REWRITES }, (_, id) => ({
        id,
        statement: `Claim rewritten ${id}.`,
      })),
    })

    const result = await verify(fakeGenerator([failedRewrites]), keepsOneClaim)

    expect(result.verifierCalls).toBe(MAX_VERIFIER_CALLS)
  })
})
