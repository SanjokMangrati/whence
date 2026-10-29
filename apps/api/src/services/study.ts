import type { Database } from '../db/client'
import type { ScheduledReview, Scheduler } from '../domain/ports'
import type { RecallRating } from '../domain/types'
import { listCitationsByOwners } from '../repositories/citations'
import { findGenerationJobForUser } from '../repositories/generation-jobs'
import {
  findQaItemForUser,
  listQaItemsForUserJob,
  removeQaItemForUser,
} from '../repositories/qa-items'
import {
  findReviewScheduleForUser,
  listDueReviewsForUser,
  listReviewSchedulesForUserJob,
  listReviewTimesForUser,
  saveReviewSchedule,
} from '../repositories/review-schedules'

const PROJECTED_REVIEWS = 4

const MONTH_MARGIN_DAYS = 1

export interface StudyDeps {
  db: Database
  scheduler: Scheduler
}

export async function listJobQuestions(db: Database, userId: string, jobId: string) {
  const job = await findGenerationJobForUser(db, userId, jobId)
  if (job === undefined) return null

  const [rows, schedules] = await Promise.all([
    listQaItemsForUserJob(db, userId, jobId),
    listReviewSchedulesForUserJob(db, userId, jobId),
  ])
  const citations = await listCitationsByOwners(
    db,
    'qa_item',
    rows.map((row) => row.id),
  )
  const dueAtByItem = new Map(schedules.map((schedule) => [schedule.qaItemId, schedule.dueAt]))
  return rows.map((row) => ({
    id: row.id,
    question: row.question,
    spanIds: citations
      .filter((citation) => citation.ownerId === row.id)
      .map((citation) => citation.spanId),
    dueAt: dueAtByItem.get(row.id) ?? null,
  }))
}

export async function listDueQuestions(db: Database, userId: string) {
  const rows = await listDueReviewsForUser(db, userId, new Date())
  return rows.map((row) => ({
    id: row.qaItemId,
    sourceId: row.sourceId,
    question: row.question,
    dueAt: row.dueAt,
  }))
}

export async function listMonthReviews(
  db: Database,
  userId: string,
  { year, month }: { year: number; month: number },
  now: Date,
) {
  const from = Date.UTC(year, month - 1, 1 - MONTH_MARGIN_DAYS)
  const before = Date.UTC(year, month, 1 + MONTH_MARGIN_DAYS)
  return listReviewTimesForUser(db, userId, now, new Date(from), new Date(before))
}

export async function rateRecall(
  deps: StudyDeps,
  userId: string,
  qaItemId: string,
  rating: RecallRating,
) {
  const item = await findQaItemForUser(deps.db, userId, qaItemId)
  if (item === undefined) return null

  const current = await findReviewScheduleForUser(deps.db, userId, qaItemId)
  const now = new Date()
  const next = deps.scheduler.next(current ?? deps.scheduler.initial, rating, now)

  await saveReviewSchedule(deps.db, {
    id: current?.id ?? crypto.randomUUID(),
    userId,
    qaItemId,
    easeFactor: next.easeFactor,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    dueAt: next.dueAt,
    lastRatedAt: now,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  })

  return {
    qaItemId,
    intervalDays: next.intervalDays,
    dueAt: next.dueAt,
    projectedDueAts: projectDueAts(deps.scheduler, next),
  }
}

export async function removeQuestion(db: Database, userId: string, qaItemId: string) {
  return removeQaItemForUser(db, userId, qaItemId, new Date())
}

function projectDueAts(scheduler: Scheduler, from: ScheduledReview) {
  const dueAts = [from.dueAt]
  let review = from
  while (dueAts.length < PROJECTED_REVIEWS) {
    review = scheduler.next(review, 'good', review.dueAt)
    dueAts.push(review.dueAt)
  }
  return dueAts
}
