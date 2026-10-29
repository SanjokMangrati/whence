import { describe, expect, it } from 'vitest'
import { evidenceOf, withContext, type SpanView } from './spans'

function spansOf(texts: string[]): SpanView[] {
  return texts.map((text, ordinal) => ({ id: `span-${ordinal}`, ordinal, kind: 'text', text }))
}

function ordinalsOf(runs: SpanView[][]): number[][] {
  return runs.map((run) => run.map((span) => span.ordinal))
}

const SENTENCES = spansOf([
  'We have the call stack, web APIs, the task queue, and the microtask queue.',
  'All these components together allow asynchronous tasks in a non-blocking way.',
  'This is important because JavaScript is single-threaded.',
  'Only one task runs at a time.',
  'A long task freezes the page.',
  'Web APIs take over such work.',
])

describe('verifier evidence', () => {
  it('adds 2 sentences before and 1 after the cited sentence', () => {
    expect(ordinalsOf(withContext(['span-2'], SENTENCES))).toEqual([[0, 1, 2, 3]])
  })

  it('stops at the start and the end of the source', () => {
    expect(ordinalsOf(withContext(['span-0'], SENTENCES))).toEqual([[0, 1]])
    expect(ordinalsOf(withContext(['span-5'], SENTENCES))).toEqual([[3, 4, 5]])
  })

  it('joins cited spans into one run when their context meets', () => {
    expect(ordinalsOf(withContext(['span-4', 'span-1'], SENTENCES))).toEqual([[0, 1, 2, 3, 4, 5]])
  })

  it('keeps cited spans far apart as separate runs', () => {
    const sentences = spansOf(Array.from({ length: 12 }, () => 'A short sentence.'))

    expect(ordinalsOf(withContext(['span-2', 'span-9'], sentences))).toEqual([
      [0, 1, 2, 3],
      [7, 8, 9, 10],
    ])
  })

  it('never adds a neighbour past 600 characters', () => {
    const paragraphs = spansOf([`${'A very long paragraph. '.repeat(30)}`, 'Short.', 'Also short.'])

    expect(ordinalsOf(withContext(['span-1'], paragraphs))).toEqual([[1, 2]])
  })

  it('joins each run into one passage', () => {
    expect(evidenceOf(['span-0'], SENTENCES)).toEqual([
      `${SENTENCES[0]!.text} ${SENTENCES[1]!.text}`,
    ])
  })

  it('fails on a span that is not in the source', () => {
    expect(() => withContext(['span-99'], SENTENCES)).toThrowError('Span span-99')
  })
})
