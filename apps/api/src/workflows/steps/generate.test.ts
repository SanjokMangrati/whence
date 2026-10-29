import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import type { Generator } from '../../domain/ports'
import type { OutputType } from '../../domain/types'
import { fakeGenerator } from '../../test/generator'
import {
  CHEAT_SHEET_JSON,
  CONCEPTS_JSON,
  NOTES_JSON,
  QA_JSON,
  checkedConcepts,
  draftsFrom,
  insertPipelineJob,
  readDrafts,
  supportsAll,
  type PipelineJob,
} from '../../test/pipeline'
import { claimsOf } from '../drafts'
import { checkConcepts } from './check-concepts'
import { extractConcepts } from './concepts'
import { generateDrafts } from './generate'

const db = createDb(env.DB)
const bucket = env.BUCKET

function conceptLines(prompt: string) {
  return prompt
    .slice(prompt.indexOf('<concepts>\n') + 11, prompt.indexOf('\n</concepts>'))
    .split('\n')
}

describe('generate step', () => {
  let job: PipelineJob

  const generate = (generator: Generator, outputType: OutputType) =>
    generateDrafts({ db, bucket, generator }, { ...job, outputType })

  beforeEach(async () => {
    job = await insertPipelineJob()
  })

  it('gives the cheat sheet the concepts by topic with each case after its principle in that topic, and Q&A the principles first', async () => {
    await checkedConcepts(
      job,
      JSON.stringify({
        concepts: [
          {
            statement: 'Recall improves with spacing.',
            role: 'principle',
            topic: 'Spacing',
            spans: [0],
          },
          { statement: 'Recall is a skill.', role: 'principle', topic: 'Recall', spans: [0] },
          { statement: 'The interval grows.', role: 'principle', topic: 'spacing', spans: [1] },
          {
            statement: 'A student reviewed on three days.',
            role: 'example',
            topic: 'Spacing',
            shows: [0],
            spans: [1],
          },
          {
            statement: 'A student forgot a deck.',
            role: 'example',
            topic: 'Recall',
            shows: [0],
            spans: [1],
          },
        ],
      }),
    )
    const generator = fakeGenerator([CHEAT_SHEET_JSON, QA_JSON])

    await generate(generator, 'cheat_sheet')

    const [cheatSheet, qa] = generator.requests
    expect(conceptLines(cheatSheet!.prompt)).toEqual([
      '[principle; topic: Spacing; spans 0] Recall improves with spacing.',
      '  [example of the principle above; spans 1] A student reviewed on three days.',
      '[principle; topic: Spacing; spans 1] The interval grows.',
      '[principle; topic: Recall; spans 0] Recall is a skill.',
      '[example; topic: Recall; spans 1] A student forgot a deck.',
    ])
    expect(conceptLines(qa!.prompt)).toEqual([
      '[principle; topic: Spacing; spans 0] Recall improves with spacing.',
      '[principle; topic: Recall; spans 0] Recall is a skill.',
      '[principle; topic: spacing; spans 1] The interval grows.',
      '[example; topic: Spacing; spans 1] A student reviewed on three days.',
      '[example; topic: Recall; spans 1] A student forgot a deck.',
    ])
  })

  it('joins a topic of 1 concept to the topic before it, or to the next one when it is first', async () => {
    const principle = (statement: string, topic: string) => ({
      statement,
      role: 'principle',
      topic,
      spans: [0],
    })
    await checkedConcepts(
      job,
      JSON.stringify({
        concepts: [
          principle('A runtime runs one task at a time.', 'Runtime'),
          principle('The stack holds frames.', 'Stack'),
          principle('A frame is popped on return.', 'Stack'),
          principle('A queue holds callbacks.', 'Queue'),
          {
            statement: 'A timer callback waits in the queue.',
            role: 'example',
            topic: 'Timers',
            shows: [3],
            spans: [0],
          },
          principle('The loop moves a callback to the stack.', 'Loop'),
          principle('The loop waits for an empty stack.', 'Loop'),
        ],
      }),
    )
    const generator = fakeGenerator([CHEAT_SHEET_JSON, QA_JSON])

    await generate(generator, 'cheat_sheet')

    const joined = 'Runtime / Stack / Queue / Timers'
    expect(conceptLines(generator.requests[0]!.prompt)).toEqual([
      `[principle; topic: ${joined}; spans 0] A runtime runs one task at a time.`,
      `[principle; topic: ${joined}; spans 0] The stack holds frames.`,
      `[principle; topic: ${joined}; spans 0] A frame is popped on return.`,
      `[principle; topic: ${joined}; spans 0] A queue holds callbacks.`,
      '  [example of the principle above; spans 0] A timer callback waits in the queue.',
      '[principle; topic: Loop; spans 0] The loop moves a callback to the stack.',
      '[principle; topic: Loop; spans 0] The loop waits for an empty stack.',
    ])
  })

  it('sends the concept, notes, cheat sheet, and Q&A requests the same system and source prefix', async () => {
    const generator = fakeGenerator([CONCEPTS_JSON, NOTES_JSON, CHEAT_SHEET_JSON, QA_JSON])

    await extractConcepts({ db, bucket, generator }, job)
    await checkConcepts({ db, bucket, generator: fakeGenerator([]), verifier: supportsAll() }, job)
    await generate(generator, 'notes_and_cheat_sheet')

    const [first, ...rest] = generator.requests
    expect(rest).toHaveLength(3)
    expect(first!.sharedPrefix).toContain('<title>Spaced repetition</title>')
    expect(first!.sharedPrefix).toContain('[1] The interval grows after each successful review.')
    for (const request of rest) {
      expect(request.system).toBe(first!.system)
      expect(request.sharedPrefix).toBe(first!.sharedPrefix)
    }
  })

  it('sends the notes, cheat sheet, and Q&A requests at the same time', async () => {
    await checkedConcepts(job)
    const answers = fakeGenerator([NOTES_JSON, CHEAT_SHEET_JSON, QA_JSON])
    let open = 0
    let mostOpen = 0
    const concurrent: Generator = {
      generate: async (request) => {
        const answer = answers.generate(request)
        open += 1
        mostOpen = Math.max(mostOpen, open)
        await new Promise((resolve) => setTimeout(resolve, 10))
        open -= 1
        return answer
      },
    }

    await generate(concurrent, 'notes_and_cheat_sheet')

    expect(mostOpen).toBe(3)
  })

  it('puts the sections in source order and removes a claim another section repeats', async () => {
    const notes = JSON.stringify({
      sections: [
        {
          heading: 'Interval',
          entries: [
            {
              text: 'The interval grows after each successful review.',
              spans: [1],
              details: [{ text: 'Spreading reviews over time improves recall.', spans: [0] }],
            },
          ],
        },
        {
          heading: 'Spacing',
          entries: [{ text: 'Spreading reviews over time improves recall.', spans: [0] }],
        },
      ],
    })

    await draftsFrom(job, [notes, QA_JSON])

    const drafts = await readDrafts(job.jobId, 'drafts')
    expect(
      drafts.artifacts[0]!.sections.map((section) => ({
        heading: section.heading,
        texts: section.entries.flatMap(claimsOf).map((claim) => claim.text),
      })),
    ).toEqual([
      { heading: 'Spacing', texts: ['Spreading reviews over time improves recall.'] },
      { heading: 'Interval', texts: ['The interval grows after each successful review.'] },
    ])
  })

  it('fails when the model writes no question', async () => {
    await checkedConcepts(job)

    await expect(
      generate(fakeGenerator([NOTES_JSON, JSON.stringify({ items: [] })]), 'notes'),
    ).rejects.toMatchObject({ code: 'generation_failed' })
  })

  it('keeps no more questions than the limit', async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      question: `Question ${index}?`,
      answer: 'The interval grows.',
      spans: [1],
    }))

    await draftsFrom(job, [NOTES_JSON, JSON.stringify({ items })])

    expect((await readDrafts(job.jobId, 'drafts')).qaItems).toHaveLength(20)
  })
})
