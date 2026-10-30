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

async function userWithDueReview() {
  const userId = await insertTestUser(db)
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
  return userId
}

describe('reminder setting repository', () => {
  let userId: string

  beforeEach(async () => {
    userId = await userWithDueReview()
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

  it('lists the user who waited longest first', async () => {
    const [recent, older] = [userId, await userWithDueReview()].sort()
    await claimReminder(db, recent!, '2030-01-01')
    await claimReminder(db, older!, '2029-12-20')

    const ids = (await listReminderRecipients(db, DAY, AS_OF, 1000)).map((row) => row.userId)
    expect(ids.indexOf(older!)).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf(older!)).toBeLessThan(ids.indexOf(recent!))
  })
})
