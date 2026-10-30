import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  collection,
  demoSignup,
  generationJob,
  providerKey,
  qaItem,
  reminderSetting,
  reviewSchedule,
  session,
  subscription,
  user,
} from '../db/schema'
import { addCollectionItems, insertCollection } from '../repositories/collections'
import { claimDemoSignup } from '../repositories/demo-signups'
import { saveProviderKey } from '../repositories/provider-keys'
import { saveReminderSetting } from '../repositories/reminder-settings'
import { saveReviewSchedule } from '../repositories/review-schedules'
import {
  insertTestArtifact,
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { purgeExpiredDemoAccounts } from './demo-accounts'

const db = createDb(env.DB)
const NOW = new Date('2026-11-10T09:00:00Z')
const MINUTE_MS = 60_000
const SEVEN_DAYS_MS = 7 * 24 * 60 * MINUTE_MS

async function accountWithData(createdAt: Date, isAnonymous: boolean) {
  const userId = await insertTestUser(db)
  await db.update(user).set({ isAnonymous, createdAt }).where(eq(user.id, userId))
  const sourceId = await insertTestSource(db)
  const jobId = await insertTestJob(db, userId, sourceId)
  const artifactId = await insertTestArtifact(db, { userId, jobId, sourceId })
  const qaItemId = await insertTestQaItem(db, { userId, jobId, sourceId })
  await saveReviewSchedule(db, {
    id: crypto.randomUUID(),
    userId,
    qaItemId,
    dueAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await saveReminderSetting(db, userId, true, NOW)
  await saveProviderKey(db, { userId, ciphertext: 'c', iv: 'i', last4: 'AbCd', createdAt: NOW })
  const collectionId = crypto.randomUUID()
  await insertCollection(db, {
    id: collectionId,
    userId,
    name: 'Biology',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await addCollectionItems(db, [
    { id: crypto.randomUUID(), collectionId, artifactId, createdAt: NOW },
  ])
  await db.insert(subscription).values({ id: crypto.randomUUID(), userId, updatedAt: NOW })
  await db.insert(session).values({
    id: crypto.randomUUID(),
    userId,
    token: crypto.randomUUID(),
    expiresAt: new Date(NOW.getTime() + SEVEN_DAYS_MS),
    ipAddress: '203.0.113.7',
    createdAt: NOW,
    updatedAt: NOW,
  })
  return userId
}

async function rowsOf(userId: string) {
  const [account] = await db.select().from(user).where(eq(user.id, userId))
  const collectionIds = await db
    .select({ id: collection.id })
    .from(collection)
    .where(eq(collection.userId, userId))
  return {
    purgedAt: account?.purgedAt ?? null,
    sessions: (await db.select().from(session).where(eq(session.userId, userId))).length,
    providerKeys: (await db.select().from(providerKey).where(eq(providerKey.userId, userId)))
      .length,
    reviews: (await db.select().from(reviewSchedule).where(eq(reviewSchedule.userId, userId)))
      .length,
    reminders: (await db.select().from(reminderSetting).where(eq(reminderSetting.userId, userId)))
      .length,
    collections: collectionIds.length,
    subscriptions: (await db.select().from(subscription).where(eq(subscription.userId, userId)))
      .length,
    jobs: (await db.select().from(generationJob).where(eq(generationJob.userId, userId))).length,
    questions: (await db.select().from(qaItem).where(eq(qaItem.userId, userId))).length,
  }
}

const untouched = {
  purgedAt: null,
  sessions: 1,
  providerKeys: 1,
  reviews: 1,
  reminders: 1,
  collections: 1,
  subscriptions: 1,
  jobs: 1,
  questions: 1,
}

describe('demo account purge', () => {
  let expiredId: string

  beforeEach(async () => {
    expiredId = await accountWithData(new Date(NOW.getTime() - SEVEN_DAYS_MS - MINUTE_MS), true)
  })

  it('removes the personal rows of a demo account older than 7 days', async () => {
    await purgeExpiredDemoAccounts(db, NOW)

    expect(await rowsOf(expiredId)).toEqual({
      purgedAt: NOW,
      sessions: 0,
      providerKeys: 0,
      reviews: 0,
      reminders: 0,
      collections: 0,
      subscriptions: 0,
      jobs: 1,
      questions: 1,
    })
  })

  it('keeps a demo account younger than 7 days', async () => {
    const recentId = await accountWithData(
      new Date(NOW.getTime() - SEVEN_DAYS_MS + MINUTE_MS),
      true,
    )
    await purgeExpiredDemoAccounts(db, NOW)
    expect(await rowsOf(recentId)).toEqual(untouched)
  })

  it('keeps an old account that is not a demo account', async () => {
    const realId = await accountWithData(new Date(NOW.getTime() - 10 * SEVEN_DAYS_MS), false)
    await purgeExpiredDemoAccounts(db, NOW)
    expect(await rowsOf(realId)).toEqual(untouched)
  })

  it('purges an account once', async () => {
    expect(await purgeExpiredDemoAccounts(db, NOW)).toBeGreaterThanOrEqual(1)

    const later = new Date(NOW.getTime() + MINUTE_MS)
    await purgeExpiredDemoAccounts(db, later)

    expect((await rowsOf(expiredId)).purgedAt).toEqual(NOW)
  })

  it('removes the sign-up counts of past days only', async () => {
    const address = crypto.randomUUID()
    await claimDemoSignup(db, { address, day: '2026-11-09', limit: 3 })
    await claimDemoSignup(db, { address, day: '2026-11-10', limit: 3 })

    await purgeExpiredDemoAccounts(db, NOW)

    const days = await db.select().from(demoSignup).where(eq(demoSignup.address, address))
    expect(days.map((row) => row.day)).toEqual(['2026-11-10'])
  })
})
