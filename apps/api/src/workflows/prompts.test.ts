import { describe, expect, it } from 'vitest'
import {
  artifactRequest,
  conceptLimit,
  conceptRequest,
  conceptRewriteRequest,
  qaLimit,
  qaRequest,
  renderSpanLines,
  type ConceptView,
} from './prompts'

const sourceOfTokens = (tokens: number) => ({
  title: null,
  sourceType: 'article' as const,
  spanLines: 'a'.repeat(tokens * 4),
})

describe('artifact output bound', () => {
  it('keeps the floor for a short source', () => {
    expect(artifactRequest('notes', sourceOfTokens(1_000), []).maxOutputTokens).toBe(16_000)
    expect(artifactRequest('cheat_sheet', sourceOfTokens(1_000), []).maxOutputTokens).toBe(8_000)
  })

  it('grows with the source', () => {
    expect(artifactRequest('notes', sourceOfTokens(20_000), []).maxOutputTokens).toBe(40_000)
    expect(artifactRequest('cheat_sheet', sourceOfTokens(20_000), []).maxOutputTokens).toBe(20_000)
  })

  it('stops at the model output limit', () => {
    expect(artifactRequest('notes', sourceOfTokens(40_000), []).maxOutputTokens).toBe(64_000)
  })
})

describe('question limit', () => {
  const concepts = (count: number, role: ConceptView['role']): ConceptView[] =>
    Array.from({ length: count }, (_, index) => ({
      statement: `Concept ${index}.`,
      role,
      topic: 'Topic',
      followsPrinciple: false,
      ordinals: [index],
    }))

  it('keeps the floor for a source that teaches little', () => {
    expect(qaLimit(concepts(4, 'principle'))).toBe(20)
    expect(qaRequest(sourceOfTokens(1_000), concepts(4, 'principle')).maxOutputTokens).toBe(4_000)
  })

  it('gives each principle and worked example room for one question', () => {
    const taught = [...concepts(30, 'principle'), ...concepts(5, 'worked_example')]
    const request = qaRequest(sourceOfTokens(1_000), [...taught, ...concepts(10, 'example')])

    expect(request.prompt).toContain('Write at most 35 question and answer pairs.')
    expect(request.maxOutputTokens).toBe(7_000)
  })

  it('stops at the ceiling', () => {
    expect(qaLimit(concepts(147, 'principle'))).toBe(60)
  })
})

describe('concept limit', () => {
  it('keeps the floor for a short source', () => {
    expect(conceptLimit(sourceOfTokens(1_000))).toBe(40)
    expect(conceptRequest(sourceOfTokens(1_000)).maxOutputTokens).toBe(8_000)
  })

  it('grows with the source', () => {
    expect(conceptLimit(sourceOfTokens(7_500))).toBe(150)
    expect(conceptRequest(sourceOfTokens(7_500)).maxOutputTokens).toBe(22_500)
  })

  it('stops at the ceiling', () => {
    expect(conceptLimit(sourceOfTokens(40_000))).toBe(400)
    expect(conceptRequest(sourceOfTokens(40_000)).maxOutputTokens).toBe(60_000)
  })
})

describe('concept rewrite bound', () => {
  const concepts = (count: number) =>
    Array.from({ length: count }, () => ({ statement: 's', evidence: ['e'] }))

  it('keeps the floor for a few concepts', () => {
    expect(conceptRewriteRequest(concepts(3)).maxOutputTokens).toBe(4_000)
  })

  it('grows with the number of concepts', () => {
    expect(conceptRewriteRequest(concepts(100)).maxOutputTokens).toBe(15_000)
  })
})

describe('numbered transcript', () => {
  it('marks article headings and fences code blocks', () => {
    expect(
      renderSpanLines([
        { ordinal: 0, kind: 'heading', text: 'Unions' },
        { ordinal: 1, kind: 'text', text: 'A union is one of many types.' },
        { ordinal: 2, kind: 'code', text: 'type MyBool =\n  true | false;' },
      ]),
    ).toBe(
      '[0] (heading) Unions\n[1] A union is one of many types.\n[2] (code)\n```\ntype MyBool =\n  true | false;\n```',
    )
  })

  it('writes video text spans as one line each', () => {
    expect(
      renderSpanLines([
        { ordinal: 0, kind: 'text', text: 'The event loop runs one task.' },
        { ordinal: 1, kind: 'text', text: 'Then it runs the microtasks.' },
      ]),
    ).toBe('[0] The event loop runs one task.\n[1] Then it runs the microtasks.')
  })

  it('asks only an article for code between backticks', () => {
    const source = { title: null, spanLines: '[0] Text.' }
    const article = artifactRequest('notes', { ...source, sourceType: 'article' }, [])
    const video = artifactRequest('notes', { ...source, sourceType: 'video' }, [])

    expect(article.prompt).toContain('between backticks')
    expect(video.prompt).not.toContain('backticks')
    expect(video.sharedPrefix).toContain('Each line of its content is one numbered span.')
  })
})
