import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { qaItem, reviewSchedule } from '../db/schema'
import { liveJobIdsForUser } from './generation-jobs'

export type NewQaItem = InferInsertModel<typeof qaItem>

export async function findQaItemForUser(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(qaItem)
    .where(
      and(
        eq(qaItem.id, id),
        eq(qaItem.userId, userId),
        isNull(qaItem.removedAt),
        inArray(qaItem.jobId, liveJobIdsForUser(db, userId)),
      ),
    )
  return row
}

export async function listQaItemsForUserJob(db: Database, userId: string, jobId: string) {
  return db
    .select()
    .from(qaItem)
    .where(
      and(
        eq(qaItem.jobId, jobId),
        eq(qaItem.userId, userId),
        isNull(qaItem.removedAt),
        inArray(qaItem.jobId, liveJobIdsForUser(db, userId)),
      ),
    )
    .orderBy(asc(qaItem.createdAt))
}

export async function listQaItemsByJob(db: Database, jobId: string) {
  return db.select().from(qaItem).where(eq(qaItem.jobId, jobId)).orderBy(asc(qaItem.createdAt))
}

export async function countQaItemsByJobForUser(db: Database, userId: string) {
  return db
    .select({ jobId: qaItem.jobId, questions: count() })
    .from(qaItem)
    .where(and(eq(qaItem.userId, userId), isNull(qaItem.removedAt)))
    .groupBy(qaItem.jobId)
}

export async function removeQaItemForUser(db: Database, userId: string, id: string, now: Date) {
  const owned = and(
    eq(qaItem.id, id),
    eq(qaItem.userId, userId),
    inArray(qaItem.jobId, liveJobIdsForUser(db, userId)),
  )
  const [removed] = await db.batch([
    db
      .update(qaItem)
      .set({ removedAt: sql`coalesce(${qaItem.removedAt}, ${Math.floor(now.getTime() / 1000)})` })
      .where(owned)
      .returning({ id: qaItem.id }),
    db
      .delete(reviewSchedule)
      .where(and(eq(reviewSchedule.qaItemId, id), eq(reviewSchedule.userId, userId))),
  ])
  return removed.length === 1
}
