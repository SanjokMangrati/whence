import { describe, expect, it } from 'vitest'
import type { ExtractedSource } from '../domain/types'
import { fakeGenerator } from '../test/generator'
import { toSentences } from './sentences'

function transcriptOf(texts: string[]): ExtractedSource {
  let charStart = 0
  const spans = texts.map((text, ordinal) => {
    const span = {
      ordinal,
      kind: 'text' as const,
      text,
      charStart,
      charEnd: charStart + text.length,
      startMs: ordinal * 2000,
      endMs: ordinal * 2000 + 4000,
    }
    charStart += text.length + 1
    return span
  })
  return {
    sourceType: 'video',
    title: 'Event loop',
    channel: null,
    lengthMs: 10_000,
    text: texts.join('\n'),
    spans,
  }
}

const CAPTIONS = transcriptOf([
  'the call stack runs one task at a time',
  'when it is empty the event loop moves',
  'a callback from the task queue',
])

describe('sentence restoration', () => {
  it('splits punctuated captions into sentences with no generator call', async () => {
    const generator = fakeGenerator([])
    const transcript = transcriptOf(['Spaced repetition works. It spreads', 'reviews over time.'])

    const result = await toSentences(generator, transcript)

    expect(generator.requests).toHaveLength(0)
    expect(result.transcript.spans.map((span) => span.text)).toEqual([
      'Spaced repetition works.',
      'It spreads reviews over time.',
    ])
  })

  it('punctuates captions with no punctuation and keeps caption timing', async () => {
    const generator = fakeGenerator([
      'The call stack runs one task at a time. When it is empty, the event loop moves a callback from the task queue.',
    ])

    const result = await toSentences(generator, CAPTIONS)

    expect(result.transcript.spans.map((span) => [span.text, span.startMs, span.endMs])).toEqual([
      ['The call stack runs one task at a time.', 0, 4000],
      ['When it is empty, the event loop moves a callback from the task queue.', 2000, 8000],
    ])
    expect(result.usage).toHaveLength(1)
  })

  it('keeps the caption word when the answer corrects it', async () => {
    const generator = fakeGenerator([
      'The call stack runs one task at a time. When it is empty, the event loop moves a callback from the macrotask queue.',
    ])

    const result = await toSentences(generator, CAPTIONS)

    expect(result.transcript.spans.map((span) => span.text)).toEqual([
      'The call stack runs one task at a time.',
      'When it is empty, the event loop moves a callback from the task queue.',
    ])
  })

  it('asks again when an answer does not align with the captions', async () => {
    const generator = fakeGenerator([
      'The event loop moves callbacks.',
      'The call stack runs one task at a time. When it is empty, the event loop moves a callback from the task queue.',
    ])

    const result = await toSentences(generator, CAPTIONS)

    expect(result.transcript.spans).toHaveLength(2)
    expect(result.usage).toHaveLength(2)
  })

  it('fails extraction when a second answer also does not align', async () => {
    const summary = 'The event loop moves callbacks.'
    const generator = fakeGenerator([summary, summary])

    await expect(toSentences(generator, CAPTIONS)).rejects.toMatchObject({
      code: 'extraction_failed',
    })
  })
})
