import type { Database } from '../db/client'
import { listArtifactsForUserJob } from '../repositories/artifacts'
import {
  addCollectionItems,
  deleteCollectionForUser,
  findCollectionForUser,
  insertCollection,
  listCollectionJobsForUser,
  listCollectionsForUser,
  removeJobFromCollection,
  renameCollectionForUser,
} from '../repositories/collections'
import { requireEntitlement, resolvePlan } from './plans'

export async function listCollections(db: Database, userId: string) {
  const [collections, jobs] = await Promise.all([
    listCollectionsForUser(db, userId),
    listCollectionJobsForUser(db, userId),
  ])
  return collections.map((row) => ({
    id: row.id,
    name: row.name,
    jobIds: jobs.filter((job) => job.collectionId === row.id).map((job) => job.jobId),
  }))
}

async function requireCollections(db: Database, userId: string) {
  requireEntitlement(await resolvePlan(db, userId), 'collections')
}

export async function createCollection(db: Database, userId: string, name: string) {
  await requireCollections(db, userId)
  const now = new Date()
  const id = crypto.randomUUID()
  await insertCollection(db, { id, userId, name, createdAt: now, updatedAt: now })
  return { id, name, jobIds: [] }
}

export async function renameCollection(db: Database, userId: string, id: string, name: string) {
  await requireCollections(db, userId)
  if ((await findCollectionForUser(db, userId, id)) === undefined) return false
  await renameCollectionForUser(db, userId, id, name, new Date())
  return true
}

export async function deleteCollection(db: Database, userId: string, id: string) {
  await requireCollections(db, userId)
  if ((await findCollectionForUser(db, userId, id)) === undefined) return false
  await deleteCollectionForUser(db, userId, id)
  return true
}

export async function addSourceToCollection(
  db: Database,
  userId: string,
  id: string,
  jobId: string,
) {
  await requireCollections(db, userId)
  const [owned, artifacts] = await Promise.all([
    findCollectionForUser(db, userId, id),
    listArtifactsForUserJob(db, userId, jobId),
  ])
  if (owned === undefined || artifacts.length === 0) return false
  const now = new Date()
  await addCollectionItems(
    db,
    artifacts.map((row) => ({
      id: crypto.randomUUID(),
      collectionId: id,
      artifactId: row.id,
      createdAt: now,
    })),
  )
  return true
}

export async function removeSourceFromCollection(
  db: Database,
  userId: string,
  id: string,
  jobId: string,
) {
  await requireCollections(db, userId)
  if ((await findCollectionForUser(db, userId, id)) === undefined) return false
  await removeJobFromCollection(db, id, jobId)
  return true
}
