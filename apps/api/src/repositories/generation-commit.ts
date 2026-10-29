import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  artifact,
  artifactCache,
  citation,
  generationJob,
  generationMetric,
  qaItem,
} from '../db/schema'
import type { NewArtifactCacheEntry } from './artifact-cache'
import { listArtifactsByJob, type NewArtifact } from './artifacts'
import type { NewCitation } from './citations'
import { insertChunks } from './insert-chunks'
import type { NewGenerationMetric } from './generation-metrics'
import { listQaItemsByJob, type NewQaItem } from './qa-items'

export interface CommittedGeneration {
  jobId: string
  artifacts: NewArtifact[]
  qaItems: NewQaItem[]
  citations: NewCitation[]
  metric: NewGenerationMetric
  cacheEntries: NewArtifactCacheEntry[]
  completedAt: Date
}

export interface CommittedIds {
  artifactIds: string[]
  qaItemIds: string[]
}

export async function insertCommittedGeneration(db: Database, input: CommittedGeneration) {
  const completeJob = db
    .update(generationJob)
    .set({ status: 'completed', stage: 'commit', updatedAt: input.completedAt })
    .where(eq(generationJob.id, input.jobId))

  await db.batch([
    completeJob,
    db.insert(generationMetric).values(input.metric).onConflictDoNothing(),
    ...insertChunks(artifact, input.artifacts).map((rows) => db.insert(artifact).values(rows)),
    ...insertChunks(qaItem, input.qaItems).map((rows) => db.insert(qaItem).values(rows)),
    ...insertChunks(citation, input.citations).map((rows) => db.insert(citation).values(rows)),
    ...(input.cacheEntries.length === 0
      ? []
      : [db.insert(artifactCache).values(input.cacheEntries).onConflictDoNothing()]),
  ])
}

export async function findCommittedGeneration(
  db: Database,
  userId: string,
  jobId: string,
): Promise<CommittedIds | null> {
  const [job] = await db
    .select({ status: generationJob.status })
    .from(generationJob)
    .where(and(eq(generationJob.id, jobId), eq(generationJob.userId, userId)))
  if (job?.status !== 'completed') return null

  const [artifacts, qaItems] = await Promise.all([
    listArtifactsByJob(db, jobId),
    listQaItemsByJob(db, jobId),
  ])
  return {
    artifactIds: artifacts.map((row) => row.id),
    qaItemIds: qaItems.map((row) => row.id),
  }
}
