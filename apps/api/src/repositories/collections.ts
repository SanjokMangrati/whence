import { and, asc, eq, inArray } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { artifact, collection, collectionItem } from '../db/schema'

export type NewCollection = InferInsertModel<typeof collection>
export type NewCollectionItem = InferInsertModel<typeof collectionItem>

export async function insertCollection(db: Database, row: NewCollection) {
  await db.insert(collection).values(row)
}

export async function findCollectionForUser(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(collection)
    .where(and(eq(collection.id, id), eq(collection.userId, userId)))
  return row
}

export async function listCollectionsForUser(db: Database, userId: string) {
  return db
    .select()
    .from(collection)
    .where(eq(collection.userId, userId))
    .orderBy(asc(collection.createdAt))
}

export async function listCollectionJobsForUser(db: Database, userId: string) {
  return db
    .selectDistinct({ collectionId: collectionItem.collectionId, jobId: artifact.jobId })
    .from(collectionItem)
    .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
    .innerJoin(artifact, eq(artifact.id, collectionItem.artifactId))
    .where(eq(collection.userId, userId))
}

export async function renameCollectionForUser(
  db: Database,
  userId: string,
  id: string,
  name: string,
  updatedAt: Date,
) {
  await db
    .update(collection)
    .set({ name, updatedAt })
    .where(and(eq(collection.id, id), eq(collection.userId, userId)))
}

export async function deleteCollectionForUser(db: Database, userId: string, id: string) {
  const owned = db
    .select({ id: collection.id })
    .from(collection)
    .where(and(eq(collection.id, id), eq(collection.userId, userId)))
  await db.batch([
    db.delete(collectionItem).where(inArray(collectionItem.collectionId, owned)),
    db.delete(collection).where(and(eq(collection.id, id), eq(collection.userId, userId))),
  ])
}

export async function addCollectionItems(db: Database, rows: NewCollectionItem[]) {
  await db.insert(collectionItem).values(rows).onConflictDoNothing()
}

export async function removeJobFromCollection(db: Database, collectionId: string, jobId: string) {
  await db
    .delete(collectionItem)
    .where(
      and(
        eq(collectionItem.collectionId, collectionId),
        inArray(
          collectionItem.artifactId,
          db.select({ id: artifact.id }).from(artifact).where(eq(artifact.jobId, jobId)),
        ),
      ),
    )
}
