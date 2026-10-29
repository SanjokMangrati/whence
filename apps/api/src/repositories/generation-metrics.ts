import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { generationMetric } from '../db/schema'

export type NewGenerationMetric = InferInsertModel<typeof generationMetric>

export async function insertGenerationMetric(db: Database, row: NewGenerationMetric) {
  await db.insert(generationMetric).values(row).onConflictDoNothing()
}
