import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { artifact, collectionItem, generationJob, qaItem, reviewSchedule } from '../db/schema'

export async function deleteGenerationJobForUser(
  db: Database,
  userId: string,
  jobId: string,
  now: Date,
) {
  const [deleted] = await db.batch([
    db
      .update(generationJob)
      .set({
        deletedAt: sql`coalesce(${generationJob.deletedAt}, ${Math.floor(now.getTime() / 1000)})`,
      })
      .where(and(eq(generationJob.id, jobId), eq(generationJob.userId, userId)))
      .returning({ id: generationJob.id }),
    db.delete(reviewSchedule).where(
      and(
        eq(reviewSchedule.userId, userId),
        inArray(
          reviewSchedule.qaItemId,
          db
            .select({ id: qaItem.id })
            .from(qaItem)
            .where(and(eq(qaItem.jobId, jobId), eq(qaItem.userId, userId))),
        ),
      ),
    ),
    db.delete(collectionItem).where(
      inArray(
        collectionItem.artifactId,
        db
          .select({ id: artifact.id })
          .from(artifact)
          .where(and(eq(artifact.jobId, jobId), eq(artifact.userId, userId))),
      ),
    ),
  ])
  return deleted.length === 1
}
