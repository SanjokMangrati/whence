import { createDb } from './db/client'
import { errorReporterFromEnv } from './providers/posthog/error-reporter'
import { createResendMailer } from './providers/resend/mailer'
import { sendDueReminders } from './services/reminders'

export async function runDailyJobs(controller: ScheduledController, env: Env) {
  const errors = errorReporterFromEnv(env)
  const run = await sendDueReminders(
    {
      db: createDb(env.DB),
      mailer: createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
      errors,
      appOrigin: env.BETTER_AUTH_URL,
    },
    new Date(controller.scheduledTime),
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
