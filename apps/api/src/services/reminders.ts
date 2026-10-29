import type { Database } from '../db/client'
import { findReminderSettingForUser, saveReminderSetting } from '../repositories/reminder-settings'

export async function readReminders(db: Database, userId: string) {
  const setting = await findReminderSettingForUser(db, userId)
  return { enabled: setting?.enabled ?? false }
}

export async function setReminders(db: Database, userId: string, enabled: boolean, now: Date) {
  await saveReminderSetting(db, userId, enabled, now)
  return { enabled }
}
