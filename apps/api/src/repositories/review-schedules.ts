import { and, asc, eq, gte, lt, lte, min, or } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { qaItem, reviewSchedule } from '../db/schema'

export type NewReviewSchedule = InferInsertModel<typeof reviewSchedule>

export async function findReviewScheduleForUser(db: Database, userId: string, qaItemId: string) {
  const [row] = await db
    .select()
    .from(reviewSchedule)
    .where(and(eq(reviewSchedule.qaItemId, qaItemId), eq(reviewSchedule.userId, userId)))
  return row
}

export async function saveReviewSchedule(db: Database, row: NewReviewSchedule) {
  await db
    .insert(reviewSchedule)
    .values(row)
    .onConflictDoUpdate({
      target: [reviewSchedule.userId, reviewSchedule.qaItemId],
      set: {
        easeFactor: row.easeFactor,
        intervalDays: row.intervalDays,
        repetitions: row.repetitions,
        dueAt: row.dueAt,
        lastRatedAt: row.lastRatedAt,
        updatedAt: row.updatedAt,
      },
    })
}

export async function listDueReviewsForUser(db: Database, userId: string, asOf: Date) {
  return db
    .select({
      qaItemId: reviewSchedule.qaItemId,
      sourceId: qaItem.sourceId,
      question: qaItem.question,
      dueAt: reviewSchedule.dueAt,
    })
    .from(reviewSchedule)
    .innerJoin(qaItem, eq(qaItem.id, reviewSchedule.qaItemId))
    .where(and(eq(reviewSchedule.userId, userId), lte(reviewSchedule.dueAt, asOf)))
    .orderBy(asc(reviewSchedule.dueAt))
}

export async function listReviewTimesForUser(
  db: Database,
  userId: string,
  asOf: Date,
  from: Date,
  before: Date,
) {
  return db
    .select({ jobId: qaItem.jobId, dueAt: reviewSchedule.dueAt })
    .from(reviewSchedule)
    .innerJoin(qaItem, eq(qaItem.id, reviewSchedule.qaItemId))
    .where(
      and(
        eq(reviewSchedule.userId, userId),
        lt(reviewSchedule.dueAt, before),
        or(gte(reviewSchedule.dueAt, from), lte(reviewSchedule.dueAt, asOf)),
      ),
    )
    .orderBy(asc(reviewSchedule.dueAt))
}

export async function listNextReviewsByJobForUser(db: Database, userId: string) {
  return db
    .select({ jobId: qaItem.jobId, dueAt: min(reviewSchedule.dueAt) })
    .from(reviewSchedule)
    .innerJoin(qaItem, eq(qaItem.id, reviewSchedule.qaItemId))
    .where(eq(reviewSchedule.userId, userId))
    .groupBy(qaItem.jobId)
}

export async function listReviewSchedulesForUserJob(db: Database, userId: string, jobId: string) {
  return db
    .select({ qaItemId: reviewSchedule.qaItemId, dueAt: reviewSchedule.dueAt })
    .from(reviewSchedule)
    .innerJoin(qaItem, eq(qaItem.id, reviewSchedule.qaItemId))
    .where(and(eq(reviewSchedule.userId, userId), eq(qaItem.jobId, jobId)))
}
