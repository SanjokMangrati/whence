import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  collection,
  collectionItem,
  demoSignup,
  providerKey,
  reminderSetting,
  reviewSchedule,
  session,
  subscription,
  user,
} from '../db/schema'

export async function purgeDemoAccounts(
  db: Database,
  purge: { createdBefore: Date; signupsBefore: string; now: Date },
) {
  const expired = and(eq(user.isAnonymous, true), lt(user.createdAt, purge.createdBefore))
  const expiredIds = db.select({ id: user.id }).from(user).where(expired)
  const expiredCollectionIds = db
    .select({ id: collection.id })
    .from(collection)
    .where(inArray(collection.userId, expiredIds))

  const [purged] = await db.batch([
    db
      .update(user)
      .set({ purgedAt: purge.now, updatedAt: purge.now })
      .where(and(expired, isNull(user.purgedAt)))
      .returning({ id: user.id }),
    db.delete(collectionItem).where(inArray(collectionItem.collectionId, expiredCollectionIds)),
    db.delete(collection).where(inArray(collection.userId, expiredIds)),
    db.delete(reviewSchedule).where(inArray(reviewSchedule.userId, expiredIds)),
    db.delete(reminderSetting).where(inArray(reminderSetting.userId, expiredIds)),
    db.delete(providerKey).where(inArray(providerKey.userId, expiredIds)),
    db.delete(subscription).where(inArray(subscription.userId, expiredIds)),
    db.delete(session).where(inArray(session.userId, expiredIds)),
    db.delete(demoSignup).where(lt(demoSignup.day, purge.signupsBefore)),
  ])
  return purged.length
}
