import { eq } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { generationJob, providerKey } from '../db/schema'

export type NewProviderKey = InferInsertModel<typeof providerKey>

export async function saveProviderKey(db: Database, row: NewProviderKey) {
  await db
    .insert(providerKey)
    .values(row)
    .onConflictDoUpdate({
      target: providerKey.userId,
      set: { ciphertext: row.ciphertext, iv: row.iv, last4: row.last4, createdAt: row.createdAt },
    })
}

export async function findProviderKeyHintForUser(db: Database, userId: string) {
  const [row] = await db
    .select({ last4: providerKey.last4 })
    .from(providerKey)
    .where(eq(providerKey.userId, userId))
  return row
}

export async function findProviderKeyForJob(db: Database, jobId: string) {
  const [row] = await db
    .select({ ciphertext: providerKey.ciphertext, iv: providerKey.iv })
    .from(generationJob)
    .innerJoin(providerKey, eq(providerKey.userId, generationJob.userId))
    .where(eq(generationJob.id, jobId))
  return row
}

export async function deleteProviderKeyForUser(db: Database, userId: string) {
  await db.delete(providerKey).where(eq(providerKey.userId, userId))
}
