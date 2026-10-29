import { describe, expect, it } from 'vitest'
import { lacksPunctuation, punctuationFrom, sameWords, toSentenceSpans } from './sentences'
import type { CanonicalSpan } from './types'

function linesOf(texts: string[]): CanonicalSpan[] {
  let charStart = 0
  return texts.map((text, ordinal) => {
    const line = {
      ordinal,
      kind: 'text' as const,
      text,
      charStart,
      charEnd: charStart + text.length,
      startMs: ordinal * 2000,
      endMs: ordinal * 2000 + 4000,
    }
    charStart += text.length + 1
    return line
  })
}

const CAPTIONS = linesOf([
  'the event Loop is a pretty notorious',
  'Topic in JavaScript but when we zoom out',
  "it's just a tiny component within the",
  'JavaScript runtime we also have the call',
  'stack',
])

describe('punctuation check', () => {
  it('finds no punctuation in automatic captions', () => {
    expect(lacksPunctuation(CAPTIONS.map((line) => line.text).join('\n'))).toBe(true)
  })

  it('accepts text with a sentence end every 40 words or fewer', () => {
    expect(
      lacksPunctuation('When you first build an application, it is easy. You have one database.'),
    ).toBe(false)
  })

  it('does not count a full stop inside a number as a sentence end', () => {
    expect(lacksPunctuation(`${'word '.repeat(50)}version 3.5 is out`)).toBe(true)
  })
})

describe('word check', () => {
  it('accepts changes to punctuation, case, and spaces', () => {
    expect(sameWords('the set timeout call', 'The setTimeout call.')).toBe(true)
  })

  it('refuses a changed, added, or removed word', () => {
    expect(sameWords('Q microtest', 'queueMicrotask')).toBe(false)
    expect(sameWords('the call stack', 'the call stack is empty')).toBe(false)
    expect(sameWords('um the stack', 'The stack.')).toBe(false)
  })
})

describe('punctuation from a model answer', () => {
  it('copies punctuation and case onto the caption words', () => {
    expect(
      punctuationFrom(
        'hi everyone so recently i gave a talk',
        'Hi, everyone! So, recently I gave a talk.',
      ),
    ).toBe('Hi, everyone! So, recently I gave a talk.')
  })

  it('keeps a caption word that the answer corrects, drops, or adds to', () => {
    const context = 'a large language model is two files a parameters file and a run file '.repeat(
      4,
    )
    const original = `${context}we train on ten terab of text and um the model can predict`
    const answer = `${context}We train on ten terabytes of text, and the model can predict.`

    expect(punctuationFrom(original, answer)).toBe(
      `${context}We train on ten terab of text, and um the model can predict.`,
    )
  })

  it('splits two words that a dash joins', () => {
    expect(
      punctuationFrom('i would just i thought i would', 'I would just—I thought I would.'),
    ).toBe('I would just — I thought I would.')
  })

  it('refuses an answer that aligns with fewer than 95% of the words', () => {
    expect(
      punctuationFrom('the call stack runs one task at a time', 'The stack is busy.'),
    ).toBeNull()
  })
})

describe('sentence spans', () => {
  it('makes one span per sentence with the times of its first and last caption line', () => {
    const punctuated =
      "The event loop is a pretty notorious topic in JavaScript. But when we zoom out, it's just a tiny component within the JavaScript runtime. We also have the call stack."

    const { text, spans } = toSentenceSpans(CAPTIONS, punctuated)

    expect(spans.map((span) => span.text)).toEqual([
      'The event loop is a pretty notorious topic in JavaScript.',
      "But when we zoom out, it's just a tiny component within the JavaScript runtime.",
      'We also have the call stack.',
    ])
    expect(spans.map((span) => [span.startMs, span.endMs])).toEqual([
      [0, 6000],
      [2000, 10000],
      [6000, 12000],
    ])
    for (const span of spans) {
      expect(text.slice(span.charStart, span.charEnd)).toBe(span.text)
    }
  })

  it('joins a piece with no letters to the sentence before it', () => {
    const lines = linesOf(['it works', 'and it ends'])

    const { spans } = toSentenceSpans(lines, 'It works. ... And it ends.')

    expect(spans.map((span) => span.text)).toEqual(['It works. ...', 'And it ends.'])
  })

  it('refuses text that does not hold the words of the caption lines', () => {
    expect(() => toSentenceSpans(CAPTIONS, 'The event loop is notorious.')).toThrow()
  })
})
