import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import {
  claimReminder,
  listReminderRecipients,
  releaseReminder,
  saveReminderSetting,
} from './reminder-settings'
import { saveReviewSchedule } from './review-schedules'

const db = createDb(env.DB)
const DAY = '2030-01-02'
const AS_OF = new Date('2030-01-02T08:00:00Z')

describe('reminder setting repository', () => {
  let userId: string

  beforeEach(async () => {
    userId = await insertTestUser(db)
    const sourceId = await insertTestSource(db)
    const jobId = await insertTestJob(db, userId, sourceId)
    const qaItemId = await insertTestQaItem(db, { userId, jobId, sourceId })
    await saveReviewSchedule(db, {
      id: crypto.randomUUID(),
      userId,
      qaItemId,
      dueAt: new Date('2030-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await saveReminderSetting(db, userId, true, new Date())
  })

  it('lists a user with an open review and reminders on', async () => {
    const recipients = await listReminderRecipients(db, DAY, AS_OF, 1000)
    expect(recipients.find((row) => row.userId === userId)?.dueCount).toBe(1)
  })

  it('gives the claim for a day to one caller only', async () => {
    expect(await claimReminder(db, userId, DAY)).toBe(true)
    expect(await claimReminder(db, userId, DAY)).toBe(false)

    await releaseReminder(db, userId, DAY, null)
    expect(await claimReminder(db, userId, DAY)).toBe(true)
  })

  it('does not claim for a user with reminders off', async () => {
    await saveReminderSetting(db, userId, false, new Date())
    expect(await claimReminder(db, userId, DAY)).toBe(false)
  })
})
