import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { waitUntil } from 'cloudflare:workers'
import { createDb } from './db/client'
import type { Email } from './domain/ports'
import { CLIENT_ADDRESS_HEADER } from './middleware/rate-limit'
import { errorReporterFromEnv } from './providers/posthog/error-reporter'
import { createResendMailer } from './providers/resend/mailer'

export function createAuth(env: Env) {
  const mailer = createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
  const reporter = errorReporterFromEnv(env)

  function send(email: Email, where: string, userId: string) {
    return mailer.send(email).catch((error: unknown) => reporter.report(error, { where, userId }))
  }

  return betterAuth({
    database: drizzleAdapter(createDb(env.DB), { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] },
      backgroundTasks: { handler: waitUntil },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        send(
          {
            to: user.email,
            subject: 'Reset your Whence password',
            text: [
              `Open this link to set a new password: ${url}`,
              'The link works for 1 hour. If you did not ask for this, you can ignore this email.',
            ].join('\n\n'),
          },
          'password_reset',
          user.id,
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        send(
          {
            to: user.email,
            subject: 'Confirm your Whence email',
            text: [
              `Open this link to confirm your email and log in: ${url}`,
              'The link works for 1 hour. If you did not sign up, you can ignore this email.',
            ].join('\n\n'),
          },
          'email_verification',
          user.id,
        ),
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
