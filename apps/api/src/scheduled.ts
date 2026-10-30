import { createDb } from './db/client'
import type { ErrorReporter } from './domain/ports'
import { errorReporterFromEnv } from './providers/posthog/error-reporter'
import { createResendMailer } from './providers/resend/mailer'
import { purgeExpiredDemoAccounts } from './services/demo-accounts'
import { sendDueReminders } from './services/reminders'

export async function runDailyJobs(controller: ScheduledController, env: Env) {
  const now = new Date(controller.scheduledTime)
  const errors = errorReporterFromEnv(env)
  const outcomes = await Promise.allSettled([
    runDemoPurge(env, errors, now),
    runReminders(env, errors, now),
  ])
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') throw outcome.reason
  }
}

async function runDemoPurge(env: Env, errors: ErrorReporter, now: Date) {
  try {
    const purged = await purgeExpiredDemoAccounts(createDb(env.DB), now)
    console.log(JSON.stringify({ event: 'demo_purge', purged }))
  } catch (error) {
    await errors.report(error, { where: 'demo_purge' })
    throw error
  }
}

async function runReminders(env: Env, errors: ErrorReporter, now: Date) {
  const run = await sendDueReminders(
    {
      db: createDb(env.DB),
      mailer: createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
      errors,
      appOrigin: env.BETTER_AUTH_URL,
    },
    now,
  )
  console.log(JSON.stringify({ event: 'reminders', sent: run.sent, failed: run.failed }))
  if (run.capped) {
    const error = new Error('More users were due a reminder than one run sends.')
    await errors.report(error, { where: 'reminder' })
    throw error
  }
  if (run.failed > 0) {
    throw new Error(`${run.failed} reminders failed.`)
  }
}
