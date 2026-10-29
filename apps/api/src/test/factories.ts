import type { Database } from '../db/client'
import { artifact, generationJob, qaItem, source, user } from '../db/schema'
import type { ArtifactType } from '../domain/types'

export async function insertTestUser(db: Database) {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.test`,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function insertTestSource(db: Database) {
  const id = crypto.randomUUID()
  await db.insert(source).values({
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    sourceType: 'article',
    contentHash: `hash-${id}`,
    r2Key: `sources/${id}.txt`,
    createdAt: new Date(),
  })
  return id
}

export async function insertTestJob(
  db: Database,
  userId: string,
  sourceId: string,
  createdAt = new Date(),
) {
  const id = crypto.randomUUID()
  await db.insert(generationJob).values({
    id,
    userId,
    sourceId,
    requestedUrl: `https://example.com/${sourceId}`,
    outputType: 'notes',
    workflowInstanceId: id,
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

export async function insertTestArtifact(
  db: Database,
  owner: { userId: string; jobId: string; sourceId: string },
  artifactType: ArtifactType = 'notes',
) {
  const id = crypto.randomUUID()
  await db.insert(artifact).values({
    id,
    ...owner,
    artifactType,
    promptVersion: 'v1',
    modelId: 'test-model',
    contentR2Key: `artifacts/${id}.md`,
    entryCount: 3,
    createdAt: new Date(),
  })
  return id
}

export async function insertTestQaItem(
  db: Database,
  owner: { userId: string; jobId: string; sourceId: string },
) {
  const id = crypto.randomUUID()
  await db.insert(qaItem).values({
    id,
    ...owner,
    question: 'What grows after each review?',
    answer: 'The interval.',
    promptVersion: 'v1',
    modelId: 'test-model',
    createdAt: new Date(),
  })
  return id
}
