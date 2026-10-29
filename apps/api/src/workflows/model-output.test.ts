import { describe, expect, it } from 'vitest'
import { parseConcepts, parseRewrites, parseSections, toSpanIds } from './model-output'

function notesWith(entry: object) {
  return JSON.stringify({ sections: [{ heading: 'Review methods', entries: [entry] }] })
}

const claim = (text: string, span: number) => ({ text, spans: [span] })

describe('model answer parsing', () => {
  it('reads JSON inside a code fence', () => {
    const answer =
      '```json\n{"concepts":[{"statement":"Spacing helps.","role":"principle","topic":"Spacing","spans":[0]}]}\n```'

    expect(parseConcepts(answer)).toEqual([
      { statement: 'Spacing helps.', role: 'principle', topic: 'Spacing', shows: [], spans: [0] },
    ])
  })

  it('fails on a concept with no known role', () => {
    const answer = JSON.stringify({
      concepts: [{ statement: 'Spacing helps.', role: 'fact', topic: 'Spacing', spans: [0] }],
    })

    expect(() => parseConcepts(answer)).toThrow(
      expect.objectContaining({ code: 'generation_failed' }),
    )
  })

  it('fails on an entry that cites no span', () => {
    expect(() => parseSections(notesWith({ text: 'Spacing helps.', spans: [] }))).toThrow(
      expect.objectContaining({ code: 'generation_failed' }),
    )
  })

  it('fails on a rewrite id that was not sent or is given twice', () => {
    const rewrites = (ids: number[]) =>
      JSON.stringify({ statements: ids.map((id) => ({ id, statement: 'Spacing helps.' })) })

    expect(parseRewrites(rewrites([1, 0]), 'statements', 2).map((r) => r.id)).toEqual([1, 0])
    expect(() => parseRewrites(rewrites([2]), 'statements', 2)).toThrow('"2" is not an id')
    expect(() => parseRewrites(rewrites([0, 0]), 'statements', 2)).toThrow('"0" is not an id')
  })

  it('reads a null rewrite as no statement', () => {
    const answer = JSON.stringify({ concepts: [{ id: 0, statement: null }] })

    expect(parseRewrites(answer, 'concepts', 1)).toEqual([{ id: 0, statement: null }])
  })

  it('drops a first column that names the row labels', () => {
    const [section] = parseSections(
      notesWith({
        table: {
          columns: ['Method', 'Timing', 'Recall'],
          rows: [
            { label: 'Spaced', cells: [claim('spread over time', 0), claim('better', 0)] },
            { label: 'Massed', cells: [claim('one sitting', 1), null] },
          ],
        },
      }),
    )

    expect(section!.entries).toEqual([
      {
        kind: 'table',
        columns: ['Timing', 'Recall'],
        rows: [
          { label: 'Spaced', cells: [claim('spread over time', 0), claim('better', 0)] },
          { label: 'Massed', cells: [claim('one sitting', 1), null] },
        ],
      },
    ])
  })

  it('writes a table with one attribute and fewer than 3 stated rows as one entry per row', () => {
    const [section] = parseSections(
      notesWith({
        table: {
          columns: ['Timing'],
          rows: [
            { label: 'Spaced', cells: [claim('spread over time', 0)] },
            { label: 'Massed', cells: [claim('one sitting', 1)] },
            { label: 'Mixed', cells: [null] },
          ],
        },
      }),
    )

    expect(section!.entries).toEqual([
      { kind: 'claim', claim: claim('Spaced: spread over time', 0), details: [] },
      { kind: 'claim', claim: claim('Massed: one sitting', 1), details: [] },
    ])
  })

  it('keeps a table that maps 3 or more things to one attribute', () => {
    const [section] = parseSections(
      notesWith({
        table: {
          columns: ['Timing'],
          rows: ['Spaced', 'Massed', 'Mixed'].map((label, span) => ({
            label,
            cells: [claim(label.toLowerCase(), span)],
          })),
        },
      }),
    )

    expect(section!.entries).toMatchObject([{ kind: 'table', columns: ['Timing'] }])
  })

  it('fails when a table row does not have one cell per column', () => {
    const notes = notesWith({
      table: {
        columns: ['Timing', 'Recall'],
        rows: [
          { label: 'Spaced', cells: [claim('spread', 0), null] },
          { label: 'Massed', cells: [claim('one sitting', 1)] },
        ],
      },
    })

    expect(() => parseSections(notes)).toThrow(
      expect.objectContaining({ code: 'generation_failed' }),
    )
  })

  it('gives no span ids to an item that cites a span the source does not have', () => {
    const spanIds = new Map([
      [0, 'span-a'],
      [1, 'span-b'],
    ])

    expect(toSpanIds([1, 0, 1], spanIds)).toEqual({ spanIds: ['span-b', 'span-a'] })
    expect(toSpanIds([0, 7], spanIds)).toEqual({ spanIds: [], invalidSpans: [7] })
  })
})
