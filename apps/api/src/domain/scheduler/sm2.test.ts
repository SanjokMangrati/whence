import { describe, expect, it } from 'vitest'
import type { ReviewState } from '../types'
import { nextReview } from './sm2'

const NEW_ITEM: ReviewState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 }
const REVIEWED_AT = new Date('2026-01-01T00:00:00.000Z')

describe('sm2', () => {
  it('produces the published interval sequence for repeated passes', () => {
    const first = nextReview(NEW_ITEM, 'good', REVIEWED_AT)
    expect(first.intervalDays).toBe(1)
    expect(first.repetitions).toBe(1)

    const second = nextReview(first, 'good', REVIEWED_AT)
    expect(second.intervalDays).toBe(6)
    expect(second.repetitions).toBe(2)

    const third = nextReview(second, 'good', REVIEWED_AT)
    expect(third.intervalDays).toBe(15)
    expect(third.repetitions).toBe(3)

    expect(nextReview(third, 'good', REVIEWED_AT).intervalDays).toBe(38)
  })

  it('matches the published ease factor for each grade', () => {
    expect(nextReview(NEW_ITEM, 'easy', REVIEWED_AT).easeFactor).toBeCloseTo(2.6, 10)
    expect(nextReview(NEW_ITEM, 'good', REVIEWED_AT).easeFactor).toBeCloseTo(2.5, 10)
    expect(nextReview(NEW_ITEM, 'hard', REVIEWED_AT).easeFactor).toBeCloseTo(2.36, 10)
    expect(nextReview(NEW_ITEM, 'again', REVIEWED_AT).easeFactor).toBeCloseTo(1.7, 10)
  })

  it('holds the ease factor at 1.3', () => {
    let state: ReviewState = NEW_ITEM
    for (let i = 0; i < 5; i++) {
      state = nextReview(state, 'again', REVIEWED_AT)
    }
    expect(state.easeFactor).toBe(1.3)
  })

  it('restarts the interval after a failed repetition', () => {
    const learned = { easeFactor: 2.5, intervalDays: 15, repetitions: 3 }
    const failed = nextReview(learned, 'again', REVIEWED_AT)
    expect(failed.intervalDays).toBe(1)
    expect(failed.repetitions).toBe(0)
  })

  it('schedules the due date the interval ahead of the review', () => {
    const state = { easeFactor: 2.5, intervalDays: 6, repetitions: 2 }
    const review = nextReview(state, 'good', REVIEWED_AT)
    expect(review.dueAt.toISOString()).toBe('2026-01-16T00:00:00.000Z')
  })
})
