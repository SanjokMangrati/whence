import { and, asc, count, eq, isNull, lt, lte, or } from 'drizzle-orm'
import type { Database } from '../db/client'
import { reminderSetting, reviewSchedule, user } from '../db/schema'

export async function findReminderSettingForUser(db: Database, userId: string) {
  const [row] = await db.select().from(reminderSetting).where(eq(reminderSetting.userId, userId))
  return row
}

export async function saveReminderSetting(
  db: Database,
  userId: string,
  enabled: boolean,
  now: Date,
) {
  await db
    .insert(reminderSetting)
    .values({ userId, enabled, updatedAt: now })
    .onConflictDoUpdate({ target: reminderSetting.userId, set: { enabled, updatedAt: now } })
}

function notSentOn(day: string) {
  return or(isNull(reminderSetting.lastSentOn), lt(reminderSetting.lastSentOn, day))
}

export async function listReminderRecipients(db: Database, day: string, asOf: Date, limit: number) {
  return db
    .select({
      userId: reminderSetting.userId,
      email: user.email,
      lastSentOn: reminderSetting.lastSentOn,
      dueCount: count(reviewSchedule.id),
    })
    .from(reminderSetting)
    .innerJoin(user, eq(user.id, reminderSetting.userId))
    .innerJoin(reviewSchedule, eq(reviewSchedule.userId, reminderSetting.userId))
    .where(and(eq(reminderSetting.enabled, true), notSentOn(day), lte(reviewSchedule.dueAt, asOf)))
    .groupBy(reminderSetting.userId, user.email, reminderSetting.lastSentOn)
    .orderBy(asc(reminderSetting.lastSentOn), asc(reminderSetting.userId))
    .limit(limit)
}

export async function claimReminder(db: Database, userId: string, day: string) {
  const rows = await db
    .update(reminderSetting)
    .set({ lastSentOn: day })
    .where(
      and(eq(reminderSetting.userId, userId), eq(reminderSetting.enabled, true), notSentOn(day)),
    )
    .returning({ userId: reminderSetting.userId })
  return rows.length === 1
}

export async function releaseReminder(
  db: Database,
  userId: string,
  day: string,
  previous: string | null,
) {
  await db
    .update(reminderSetting)
    .set({ lastSentOn: previous })
    .where(and(eq(reminderSetting.userId, userId), eq(reminderSetting.lastSentOn, day)))
}
