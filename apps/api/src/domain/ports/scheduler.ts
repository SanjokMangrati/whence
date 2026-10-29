import type { RecallRating, ReviewState } from '../types'

export interface ScheduledReview extends ReviewState {
  dueAt: Date
}

export interface Scheduler {
  initial: ReviewState
  next(state: ReviewState, rating: RecallRating, reviewedAt: Date): ScheduledReview
}
