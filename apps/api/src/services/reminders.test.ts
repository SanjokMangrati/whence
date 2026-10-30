import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import type { Email, ErrorReporter, Mailer } from '../domain/ports'
import { findReminderSettingForUser } from '../repositories/reminder-settings'
import { saveReviewSchedule } from '../repositories/review-schedules'
import {
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { readReminders, sendDueReminders, setReminders } from './reminders'

const db = createDb(env.DB)
const NOW = new Date('2026-10-01T09:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const appOrigin = 'https://app.test'

function recordingMailer(fail = false): Mailer & { sent: Email[] } {
  const sent: Email[] = []
  return {
    sent,
    async send(email) {
      if (fail) throw new Error('mail provider is down')
      sent.push(email)
    },
  }
}

const reported: unknown[] = []
const errors: ErrorReporter = {
  async report(error) {
    reported.push(error)
  },
}

function sentTo(mailer: { sent: Email[] }, userId: string) {
  return mailer.sent.filter((email) => email.to === `${userId}@example.test`)
}

async function userWithReviews(dueAts: Date[]) {
  const userId = await insertTestUser(db)
  const sourceId = await insertTestSource(db)
  const jobId = await insertTestJob(db, userId, sourceId)
  for (const dueAt of dueAts) {
    const qaItemId = await insertTestQaItem(db, { userId, jobId, sourceId })
    await saveReviewSchedule(db, {
      id: crypto.randomUUID(),
      userId,
      qaItemId,
      dueAt,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }
  return userId
}

describe('reminders service', () => {
  let userId: string

  beforeEach(async () => {
    userId = await userWithReviews([new Date(NOW.getTime() - DAY_MS), NOW])
  })

  it('is off until the user turns it on', async () => {
    expect(await readReminders(db, userId)).toEqual({ enabled: false })
    await setReminders(db, userId, true, NOW)
    expect(await readReminders(db, userId)).toEqual({ enabled: true })
    await setReminders(db, userId, false, NOW)
    expect(await readReminders(db, userId)).toEqual({ enabled: false })
  })

  it('sends one email with the due count and quiz link', async () => {
    await setReminders(db, userId, true, NOW)
    const mailer = recordingMailer()

    await sendDueReminders({ db, mailer, errors, appOrigin }, NOW)

    expect(sentTo(mailer, userId)).toEqual([
      {
        to: `${userId}@example.test`,
        subject: '2 questions are due for review',
        text: expect.stringContaining('Start quiz: https://app.test/quiz'),
        idempotencyKey: `reminder/${userId}/2026-10-01`,
      },
    ])
  })

  it('sends nothing to a user with reminders off', async () => {
    const mailer = recordingMailer()
    await sendDueReminders({ db, mailer, errors, appOrigin }, NOW)
    expect(sentTo(mailer, userId)).toEqual([])

    await setReminders(db, userId, true, NOW)
    await setReminders(db, userId, false, NOW)
    await sendDueReminders({ db, mailer, errors, appOrigin }, NOW)
    expect(sentTo(mailer, userId)).toEqual([])
  })

  it('sends nothing when no review is due yet', async () => {
    const laterId = await userWithReviews([new Date(NOW.getTime() + 60_000)])
    await setReminders(db, laterId, true, NOW)
    const mailer = recordingMailer()

    await sendDueReminders({ db, mailer, errors, appOrigin }, NOW)

    expect(sentTo(mailer, laterId)).toEqual([])
  })

  it('sends once a day when the cron runs twice', async () => {
    await setReminders(db, userId, true, NOW)
    const mailer = recordingMailer()
    const deps = { db, mailer, errors, appOrigin }

    await Promise.all([sendDueReminders(deps, NOW), sendDueReminders(deps, NOW)])
    await sendDueReminders(deps, new Date(NOW.getTime() + 60 * 60 * 1000))
    expect(sentTo(mailer, userId)).toHaveLength(1)

    await sendDueReminders(deps, new Date(NOW.getTime() + DAY_MS))
    expect(sentTo(mailer, userId)).toHaveLength(2)
  })

  it('keeps a failed reminder for the next run', async () => {
    await setReminders(db, userId, true, NOW)
    const deps = { db, errors, appOrigin }

    const failed = await sendDueReminders({ ...deps, mailer: recordingMailer(true) }, NOW)
    expect(failed.failed).toBeGreaterThanOrEqual(1)
    expect((await findReminderSettingForUser(db, userId))?.lastSentOn).toBeNull()
    expect(reported).toContainEqual(new Error('mail provider is down'))

    const mailer = recordingMailer()
    await sendDueReminders({ ...deps, mailer }, NOW)
    expect(sentTo(mailer, userId)).toHaveLength(1)
  })
})
