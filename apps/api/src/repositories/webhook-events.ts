import { eq } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { webhookEvent } from '../db/schema'

export type NewWebhookEvent = InferInsertModel<typeof webhookEvent>

export async function insertWebhookEvent(db: Database, row: NewWebhookEvent) {
  await db.insert(webhookEvent).values(row).onConflictDoNothing()
}

export async function findWebhookEvent(db: Database, providerEventId: string) {
  const [row] = await db
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.providerEventId, providerEventId))
  return row
}

export async function markWebhookEventProcessed(db: Database, id: string, processedAt: Date) {
  await db.update(webhookEvent).set({ processedAt }).where(eq(webhookEvent.id, id))
}
