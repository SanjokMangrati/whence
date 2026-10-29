import { eq, type InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { generationMetric } from '../db/schema'

export type NewGenerationMetric = InferInsertModel<typeof generationMetric>

export async function insertGenerationMetric(db: Database, row: NewGenerationMetric) {
  await db.insert(generationMetric).values(row).onConflictDoNothing()
}

export async function findGenerationCostForJob(db: Database, jobId: string) {
  const [row] = await db
    .select({ costUsd: generationMetric.costUsd })
    .from(generationMetric)
    .where(eq(generationMetric.jobId, jobId))
  return row?.costUsd ?? null
}
