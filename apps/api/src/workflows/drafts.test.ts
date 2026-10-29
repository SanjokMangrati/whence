import { describe, expect, it } from 'vitest'
import {
  sectionsInSourceOrder,
  withoutRepeatedDetails,
  withoutRepeatsAcrossSections,
  type DraftClaim,
  type DraftEntry,
  type DraftSection,
  type Entry,
} from './drafts'

function entryOf(text: string, ...details: string[]): Entry<{ text: string }> {
  return { kind: 'claim', claim: { text }, details: details.map((detail) => ({ text: detail })) }
}

describe('withoutRepeatedDetails', () => {
  it('removes a detail that repeats its entry word for word', () => {
    const text =
      'Weights scaled to 250+ concurrent GPUs across multiple clouds, handling 500,000+ inference runs daily across AWS, GCP, and Azure.'

    expect(withoutRepeatedDetails(entryOf(text, text))).toEqual({
      kind: 'claim',
      claim: { text },
      details: [],
    })
  })

  it('removes a detail that repeats most words of its entry', () => {
    const entry = entryOf(
      'Language models generate responses one token at a time, where each token is a probabilistic guess selected from a set of over 100,000 options.',
      'Each piece is a probabilistic guess from over 100,000 options',
    )

    expect(withoutRepeatedDetails(entry)).toMatchObject({ details: [] })
  })

  it('keeps a detail that adds a concrete case', () => {
    const entry = entryOf(
      'Different tasks benefit from different temperature settings to balance precision and variation.',
      'Writing code uses temperature 0.2 to 0.4 for precision, general tasks use 0.7 to 1.0 for balance, and creative writing uses 1.0 or higher for variation',
    )

    expect(withoutRepeatedDetails(entry)).toBe(entry)
  })

  it('removes only the repeated detail when a point has several', () => {
    const point = 'Multipart uploads split large files into chunks.'
    const entry = entryOf(
      point,
      'Multipart uploads split large files into chunks.',
      'Files larger than 100 megabytes use multipart uploads.',
    )

    expect(withoutRepeatedDetails(entry)).toEqual(
      entryOf(point, 'Files larger than 100 megabytes use multipart uploads.'),
    )
  })
})

function claim(text: string, ...spanIds: string[]): DraftClaim {
  return { text, spanIds }
}

function point(main: DraftClaim, ...details: DraftClaim[]): DraftEntry {
  return { kind: 'claim', claim: main, details }
}

function section(heading: string, ...entries: DraftEntry[]): DraftSection {
  return { heading, entries }
}

describe('sectionsInSourceOrder', () => {
  const ordinals = new Map(['s0', 's1', 's2', 's3', 's4'].map((id, index) => [id, index]))

  it('puts sections in the order of the first span their points cite', () => {
    const late = section('Softmax', point(claim('Softmax gives a distribution.', 's3')))
    const early = section('Chatbots', point(claim('A chatbot predicts the next word.', 's1')))
    const first = section('Tokens', point(claim('Text splits into tokens.', 's0')))

    expect(sectionsInSourceOrder([first, late, early], ordinals)).toEqual([first, early, late])
  })

  it('does not move a section for a detail that cites an earlier scenario', () => {
    const scenario = section('Setup', point(claim('The demo starts a timer.', 's1')))
    const later = section(
      'Timer result',
      point(
        claim('The callback runs after the stack is empty.', 's3'),
        claim('In the timer demo, the callback runs last.', 's1', 's4'),
      ),
    )

    expect(sectionsInSourceOrder([scenario, later], ordinals)).toEqual([scenario, later])
  })

  it('places a section by its steps when it has no point', () => {
    const steps = section('Walkthrough', {
      kind: 'steps',
      steps: [claim('The first call runs.', 's2'), claim('The second call waits.', 's3')],
    })
    const before = section('Basics', point(claim('Calls run in order.', 's0')))

    expect(sectionsInSourceOrder([steps, before], ordinals)).toEqual([before, steps])
  })
})

describe('withoutRepeatsAcrossSections', () => {
  const vector =
    'Each token is associated with a vector, which is a list of numbers that encodes the meaning of that piece.'

  it('removes a detail that a point in another section repeats, and keeps the point', () => {
    const flow = section(
      'Transformer data flow',
      point(
        claim('Data flows through the model in stages.', 's0'),
        claim(
          'Associate each token with a vector, which is a list of numbers that encodes the meaning of that piece.',
          's1',
        ),
      ),
    )
    const embeddings = section('Word embeddings', point(claim(vector, 's1')))

    expect(withoutRepeatsAcrossSections([flow, embeddings])).toEqual([
      section(
        'Transformer data flow',
        point(claim('Data flows through the model in stages.', 's0')),
      ),
      embeddings,
    ])
  })

  it('removes the later of two points and keeps its details as points', () => {
    const first = section('Embeddings', point(claim(vector, 's1')))
    const later = section(
      'Vectors',
      point(claim(vector, 's1'), claim('GPT-3 vectors have 12,288 dimensions.', 's2')),
    )

    expect(withoutRepeatsAcrossSections([first, later])).toEqual([
      first,
      section('Vectors', point(claim('GPT-3 vectors have 12,288 dimensions.', 's2'))),
    ])
  })

  it('keeps a contrast inside one section', () => {
    const contrast = section(
      'Dot products',
      point(claim('Positive dot product: Vectors point in similar directions.', 's1')),
      point(claim('Negative dot product: Vectors point in opposite directions.', 's1')),
    )
    const sections = [contrast]

    expect(withoutRepeatsAcrossSections(sections)).toBe(sections)
  })

  it('keeps claims that share words but cite no common span', () => {
    const sections = [
      section('Tokens', point(claim(vector, 's1'))),
      section('Images', point(claim(vector, 's2'))),
    ]

    expect(withoutRepeatsAcrossSections(sections)).toBe(sections)
  })

  it('removes a section that only repeated other sections', () => {
    const kept = section('Embeddings', point(claim(vector, 's1')))

    expect(
      withoutRepeatsAcrossSections([kept, section('Again', point(claim(vector, 's1')))]),
    ).toEqual([kept])
  })
})
