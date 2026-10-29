import type { Database } from '../db/client'
import { generationJob, usageRecord } from '../db/schema'
import type { NewGenerationJob } from './generation-jobs'
import type { NewUsageRecord } from './usage-records'

export async function insertReservedGenerationJob(
  db: Database,
  job: NewGenerationJob,
  reservation: NewUsageRecord,
) {
  await db.batch([db.insert(generationJob).values(job), db.insert(usageRecord).values(reservation)])
}
