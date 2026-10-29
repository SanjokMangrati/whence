import { and, count, eq, isNull, sql } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { usageRecord } from '../db/schema'

export type NewUsageRecord = InferInsertModel<typeof usageRecord>

export async function countUsageForUserInPeriod(db: Database, userId: string, period: string) {
  const [row] = await db
    .select({ value: count() })
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.userId, userId),
        eq(usageRecord.period, period),
        isNull(usageRecord.returnedAt),
      ),
    )
  return row?.value ?? 0
}

export async function deleteUsageRecordForJob(db: Database, jobId: string) {
  await db.delete(usageRecord).where(eq(usageRecord.jobId, jobId))
}

export async function returnUsageRecordForFailedJob(
  db: Database,
  input: { jobId: string; limit: number; now: Date },
) {
  const rows = await db
    .update(usageRecord)
    .set({ returnedAt: input.now })
    .where(
      and(
        eq(usageRecord.jobId, input.jobId),
        isNull(usageRecord.returnedAt),
        sql`(
          SELECT COUNT(*) FROM usage_record AS returned
          WHERE returned.user_id = usage_record.user_id
            AND returned.period = usage_record.period
            AND returned.returned_at IS NOT NULL
        ) < ${input.limit}`,
      ),
    )
    .returning({ id: usageRecord.id })
  return rows.length === 1
}
