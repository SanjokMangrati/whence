import { and, count, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { generationJob, source } from '../db/schema'

export type NewGenerationJob = InferInsertModel<typeof generationJob>
export type GenerationStage = NonNullable<(typeof generationJob.$inferSelect)['stage']>
export type JobStatus = (typeof generationJob.$inferSelect)['status']

export async function findGenerationJobForUser(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(generationJob)
    .where(
      and(
        eq(generationJob.id, id),
        eq(generationJob.userId, userId),
        isNull(generationJob.deletedAt),
      ),
    )
  return row
}

export function liveJobIdsForUser(db: Database, userId: string) {
  return db
    .select({ id: generationJob.id })
    .from(generationJob)
    .where(and(eq(generationJob.userId, userId), isNull(generationJob.deletedAt)))
}

export async function countRunningJobsForUser(db: Database, userId: string, since: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(generationJob)
    .where(
      and(
        eq(generationJob.userId, userId),
        inArray(generationJob.status, ['queued', 'running']),
        gte(generationJob.createdAt, since),
      ),
    )
  return row?.value ?? 0
}

export async function countSpendingJobsBetween(
  db: Database,
  range: { from: Date; to: Date },
  freeFailureCodes: readonly string[],
) {
  const [row] = await db
    .select({ value: count() })
    .from(generationJob)
    .where(
      and(
        gte(generationJob.createdAt, range.from),
        lt(generationJob.createdAt, range.to),
        or(
          ne(generationJob.status, 'failed'),
          isNull(generationJob.errorCode),
          notInArray(generationJob.errorCode, [...freeFailureCodes]),
        ),
      ),
    )
  return row?.value ?? 0
}

export async function listGenerationJobsForUser(db: Database, userId: string) {
  return db
    .select({
      id: generationJob.id,
      requestedUrl: generationJob.requestedUrl,
      outputType: generationJob.outputType,
      status: generationJob.status,
      stage: generationJob.stage,
      errorCode: generationJob.errorCode,
      createdAt: generationJob.createdAt,
      sourceType: source.sourceType,
      sourceTitle: source.title,
      sourceChannel: source.channel,
    })
    .from(generationJob)
    .leftJoin(source, eq(generationJob.sourceId, source.id))
    .where(and(eq(generationJob.userId, userId), isNull(generationJob.deletedAt)))
    .orderBy(desc(generationJob.createdAt))
}

export async function updateGenerationJobStage(
  db: Database,
  id: string,
  patch: {
    stage?: (typeof generationJob.$inferSelect)['stage']
    status?: (typeof generationJob.$inferSelect)['status']
    sourceId?: string
    errorCode?: string
    errorMessage?: string
    updatedAt: Date
  },
) {
  await db.update(generationJob).set(patch).where(eq(generationJob.id, id))
}
