import { and, asc, eq, inArray } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { artifact } from '../db/schema'
import { liveJobIdsForUser } from './generation-jobs'

export type NewArtifact = InferInsertModel<typeof artifact>

export async function findArtifactForUser(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(artifact)
    .where(
      and(
        eq(artifact.id, id),
        eq(artifact.userId, userId),
        inArray(artifact.jobId, liveJobIdsForUser(db, userId)),
      ),
    )
  return row
}

export async function listArtifactsForUserJob(db: Database, userId: string, jobId: string) {
  return db
    .select()
    .from(artifact)
    .where(
      and(
        eq(artifact.jobId, jobId),
        eq(artifact.userId, userId),
        inArray(artifact.jobId, liveJobIdsForUser(db, userId)),
      ),
    )
    .orderBy(asc(artifact.artifactType))
}

export async function listArtifactsByJob(db: Database, jobId: string) {
  return db
    .select()
    .from(artifact)
    .where(eq(artifact.jobId, jobId))
    .orderBy(asc(artifact.artifactType))
}

export async function listNotesEntryCountsForUser(db: Database, userId: string) {
  return db
    .select({ jobId: artifact.jobId, entryCount: artifact.entryCount })
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.artifactType, 'notes')))
}
