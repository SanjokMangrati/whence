import { describe, expect, it } from 'vitest'
import { groupAdjacent, passageLabel } from './passages'

const at = (...ordinals: number[]) =>
  ordinals.map((spanOrdinal) => ({ spanOrdinal, startMs: null, endMs: null }))

const caption = (spanOrdinal: number, startMs: number, endMs: number) => ({
  spanOrdinal,
  startMs,
  endMs,
})

describe('passages', () => {
  it('joins citations of adjacent lines and splits at a gap', () => {
    expect(groupAdjacent(at(14, 15, 20, 21))).toEqual([at(14, 15), at(20, 21)])
  })

  it('orders citations by position and drops a repeated line', () => {
    expect(groupAdjacent(at(7, 5, 6, 6, 9))).toEqual([at(5, 6, 7), at(9)])
  })

  it('labels a video passage with its start and end time', () => {
    const [first, second] = groupAdjacent([
      caption(14, 44_000, 47_000),
      caption(15, 47_000, 50_000),
      caption(20, 60_000, 63_000),
      caption(21, 63_000, 65_000),
    ])
    expect(passageLabel(first![0]!, first!.at(-1)!)).toBe('0:44–0:50')
    expect(passageLabel(second![0]!, second!.at(-1)!)).toBe('1:00–1:05')
  })

  it('labels a single caption line with its start time only', () => {
    const line = caption(3, 12_000, 15_000)
    expect(passageLabel(line, line)).toBe('0:12')
  })

  it('labels an article passage with paragraph numbers from 1', () => {
    const [single] = at(2)
    const [first, , last] = at(2, 3, 4)
    expect(passageLabel(single!, single!)).toBe('3')
    expect(passageLabel(first!, last!)).toBe('3–5')
  })
})
