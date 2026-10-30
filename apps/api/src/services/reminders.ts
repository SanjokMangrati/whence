import type { Database } from '../db/client'
import type { ErrorReporter, Mailer } from '../domain/ports'
import {
  claimReminder,
  findReminderSettingForUser,
  listReminderRecipients,
  releaseReminder,
  saveReminderSetting,
} from '../repositories/reminder-settings'

export interface ReminderDeps {
  db: Database
  mailer: Mailer
  errors: ErrorReporter
  appOrigin: string
}

export interface ReminderRun {
  sent: number
  failed: number
  capped: boolean
}

const RECIPIENTS_PER_RUN = 300

export async function readReminders(db: Database, userId: string) {
  const setting = await findReminderSettingForUser(db, userId)
  return { enabled: setting?.enabled ?? false }
}

export async function setReminders(db: Database, userId: string, enabled: boolean, now: Date) {
  await saveReminderSetting(db, userId, enabled, now)
  return { enabled }
}

export async function sendDueReminders(deps: ReminderDeps, now: Date): Promise<ReminderRun> {
  const day = now.toISOString().slice(0, 10)
  const recipients = await listReminderRecipients(deps.db, day, now, RECIPIENTS_PER_RUN + 1)
  const run: ReminderRun = { sent: 0, failed: 0, capped: recipients.length > RECIPIENTS_PER_RUN }

  for (const recipient of recipients.slice(0, RECIPIENTS_PER_RUN)) {
    if (!(await claimReminder(deps.db, recipient.userId, day))) continue
    try {
      await deps.mailer.send({
        to: recipient.email,
        ...reminderEmail(recipient.dueCount, deps.appOrigin),
        idempotencyKey: `reminder/${recipient.userId}/${day}`,
      })
      run.sent += 1
    } catch (error) {
      await releaseReminder(deps.db, recipient.userId, day, recipient.lastSentOn)
      await deps.errors.report(error, { where: 'reminder', userId: recipient.userId })
      run.failed += 1
    }
  }
  return run
}

function reminderEmail(dueCount: number, appOrigin: string) {
  const questions = dueCount === 1 ? '1 question' : `${dueCount} questions`
  return {
    subject: `${questions} ${dueCount === 1 ? 'is' : 'are'} due for review`,
    text: [
      `You have ${questions} to review today. Review them now, before you forget them.`,
      `Start quiz: ${appOrigin}/quiz`,
      `To stop these emails, turn off reminders in Settings: ${appOrigin}/settings`,
    ].join('\n\n'),
  }
}
