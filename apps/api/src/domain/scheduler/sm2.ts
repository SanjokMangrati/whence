import type { ScheduledReview, Scheduler } from '../ports/scheduler'
import type { RecallRating, ReviewState } from '../types'

const GRADE: Record<RecallRating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
}

const MIN_EASE_FACTOR = 1.3

const PASS_GRADE = 3

const DAY_MS = 24 * 60 * 60 * 1000

export function nextReview(
  state: ReviewState,
  rating: RecallRating,
  reviewedAt: Date,
): ScheduledReview {
  const grade = GRADE[rating]
  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    state.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
  )

  if (grade < PASS_GRADE) {
    return {
      easeFactor,
      intervalDays: 1,
      repetitions: 0,
      dueAt: new Date(reviewedAt.getTime() + DAY_MS),
    }
  }

  const repetitions = state.repetitions + 1
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(state.intervalDays * easeFactor)

  return {
    easeFactor,
    intervalDays,
    repetitions,
    dueAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS),
  }
}

export const sm2Scheduler: Scheduler = {
  initial: { easeFactor: 2.5, intervalDays: 0, repetitions: 0 },
  next: nextReview,
}
