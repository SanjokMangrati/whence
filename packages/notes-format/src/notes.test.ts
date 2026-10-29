import { describe, expect, it } from 'vitest'
import { inlineCode, parseNotes, questionsFor, splitTerm } from './notes'

const ordinal = (value: number) => value

describe('notes', () => {
  it('reads entries under their headings and strips the markers', () => {
    const markdown =
      '# Spaced repetition\n\n## Why spacing works\n- Spreading reviews improves recall.[^1][^2]\n' +
      '## Intervals\n- The interval grows.[^3]'

    expect(parseNotes(markdown, ordinal)).toEqual([
      {
        heading: 'Why spacing works',
        blocks: [
          {
            kind: 'entry',
            line: { text: 'Spreading reviews improves recall.', citations: [0, 1] },
            details: [],
          },
        ],
      },
      {
        heading: 'Intervals',
        blocks: [
          { kind: 'entry', line: { text: 'The interval grows.', citations: [2] }, details: [] },
        ],
      },
    ])
  })

  it('attaches each detail to the entry above it', () => {
    const markdown =
      '- Spacing improves recall.[^1]\n  - A week gap beat one sitting.[^2]\n  - Three reviews beat one.[^3]'

    expect(parseNotes(markdown, ordinal)[0]!.blocks).toEqual([
      {
        kind: 'entry',
        line: { text: 'Spacing improves recall.', citations: [0] },
        details: [
          { text: 'A week gap beat one sitting.', citations: [1] },
          { text: 'Three reviews beat one.', citations: [2] },
        ],
      },
    ])
  })

  it('splits two procedures that follow each other', () => {
    const markdown =
      '## Steps\n- Intro.[^1]\n\n1. Review.[^2]\n2. Wait.[^3]\n\n1. Rate.[^4]\n2. Repeat.[^5]\n'

    const blocks = parseNotes(markdown, ordinal)[0]!.blocks
    expect(blocks.map((block) => block.kind)).toEqual(['entry', 'steps', 'steps'])
    expect(blocks[1]).toEqual({
      kind: 'steps',
      steps: [
        { text: 'Review.', citations: [1] },
        { text: 'Wait.', citations: [2] },
      ],
    })
  })

  it('reads a table with empty and escaped cells', () => {
    const markdown =
      '## Review methods\n\n|  | Timing | Recall |\n| --- | --- | --- |\n' +
      '| Spaced | spread over time[^1] | better[^2] |\n' +
      '| Massed \\| crammed | one sitting[^3] |  |\n\n## Next\n- After.[^4]'

    const [methods, next] = parseNotes(markdown, ordinal)
    expect(methods!.blocks).toEqual([
      {
        kind: 'table',
        columns: ['Timing', 'Recall'],
        rows: [
          {
            label: 'Spaced',
            cells: [
              { text: 'spread over time', citations: [0] },
              { text: 'better', citations: [1] },
            ],
          },
          {
            label: 'Massed | crammed',
            cells: [{ text: 'one sitting', citations: [2] }, null],
          },
        ],
      },
    ])
    expect(next!.heading).toBe('Next')
  })

  it('offers the questions that cite a span the section cites', () => {
    const [section] = parseNotes('## A\n- One.[^1]\n  - Detail.[^2]', (index) => ({
      spanId: ['s1', 's9'][index]!,
    }))
    const questions = [
      { id: 'q1', spanIds: ['s2', 's9'] },
      { id: 'q2', spanIds: ['s3'] },
      { id: 'q3', spanIds: ['s1'] },
    ]

    expect(questionsFor(section!, questions).map((question) => question.id)).toEqual(['q1', 'q3'])
  })
})

describe('inline code', () => {
  it('splits text into plain and code segments', () => {
    expect(inlineCode('Use `typeof x` before `Array.isArray(a)`.')).toEqual([
      { text: 'Use ', code: false },
      { text: 'typeof x', code: true },
      { text: ' before ', code: false },
      { text: 'Array.isArray(a)', code: true },
      { text: '.', code: false },
    ])
  })

  it('keeps a backtick with no pair as text', () => {
    expect(inlineCode('A ` alone')).toEqual([{ text: 'A ` alone', code: false }])
  })

  it('ends a term at the first colon outside code', () => {
    expect(splitTerm('`id: number`: The user id.')).toEqual({
      term: '`id: number`',
      fact: 'The user id.',
    })
    expect(splitTerm('Generation 0: Eden space.')).toEqual({
      term: 'Generation 0',
      fact: 'Eden space.',
    })
    expect(splitTerm('No term here.')).toEqual({ term: null, fact: 'No term here.' })
  })
})
