import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { subscription, user } from '../db/schema'

export type NewSubscription = InferInsertModel<typeof subscription>

export async function findSubscriptionForUser(db: Database, userId: string) {
  const [row] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  return row
}

export async function findPlanStateForUser(db: Database, userId: string) {
  const [row] = await db
    .select({
      isAnonymous: user.isAnonymous,
      tier: subscription.tier,
      status: subscription.status,
    })
    .from(user)
    .leftJoin(subscription, eq(subscription.userId, user.id))
    .where(eq(user.id, userId))
  return row
}

export async function upsertSubscription(db: Database, row: NewSubscription) {
  await db
    .insert(subscription)
    .values(row)
    .onConflictDoUpdate({
      target: subscription.userId,
      set: {
        tier: row.tier,
        status: row.status,
        providerCustomerId: row.providerCustomerId,
        providerSubscriptionId: row.providerSubscriptionId,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        lastEventAt: row.lastEventAt,
        updatedAt: row.updatedAt,
      },
      setWhere: and(
        or(
          isNull(subscription.lastEventAt),
          lte(subscription.lastEventAt, sql`excluded.last_event_at`),
        ),
        or(
          eq(subscription.status, 'canceled'),
          isNull(subscription.providerSubscriptionId),
          eq(subscription.providerSubscriptionId, sql`excluded.provider_subscription_id`),
        ),
      ),
    })
}
