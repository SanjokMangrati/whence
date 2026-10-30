import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware, getIP } from 'better-auth/api'
import { anonymous } from 'better-auth/plugins/anonymous'
import { captcha } from 'better-auth/plugins/captcha'
import { waitUntil } from 'cloudflare:workers'
import { createDb, type Database } from './db/client'
import type { Email } from './domain/ports'
import { CLIENT_ADDRESS } from './middleware/rate-limit'
import { errorReporterFromEnv } from './providers/posthog/error-reporter'
import { createResendMailer } from './providers/resend/mailer'
import { claimDemoSignup } from './repositories/demo-signups'

const DEMO_ACCOUNT_PATH = '/sign-in/anonymous'
const DEMO_ACCOUNTS_PER_ADDRESS_PER_DAY = 3

export function createAuth(env: Env) {
  const mailer = createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
  const reporter = errorReporterFromEnv(env)

  function send(email: Email, where: string, userId: string) {
    return mailer.send(email).catch((error: unknown) => reporter.report(error, { where, userId }))
  }

  const db = createDb(env.DB)

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: CLIENT_ADDRESS,
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
    plugins:
      env.TURNSTILE_SECRET_KEY === undefined
        ? []
        : demoAccountPlugins(db, {
            secretKey: env.TURNSTILE_SECRET_KEY,
            hostname: new URL(env.BETTER_AUTH_URL).hostname,
          }),
  })
}

function demoAccountPlugins(db: Database, turnstile: { secretKey: string; hostname: string }) {
  const limit: BetterAuthPlugin = {
    id: 'demo-account-limit',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === DEMO_ACCOUNT_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const address = (ctx.request && getIP(ctx.request, ctx.context.options)) ?? 'local'
            const day = new Date().toISOString().slice(0, 10)
            const claimed = await claimDemoSignup(db, {
              address,
              day,
              limit: DEMO_ACCOUNTS_PER_ADDRESS_PER_DAY,
            })
            if (!claimed) {
              throw APIError.from('TOO_MANY_REQUESTS', {
                code: 'DEMO_ACCOUNT_LIMIT',
                message: 'This address has made its demo accounts for today.',
              })
            }
          }),
        },
      ],
    },
  }

  return [
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: turnstile.secretKey,
      endpoints: [DEMO_ACCOUNT_PATH],
      expectedAction: 'demo_account',
      allowedHostnames: [turnstile.hostname],
    }),
    anonymous({
      generateRandomEmail: () => `demo-${crypto.randomUUID()}@demo.invalid`,
      generateName: () => 'Demo',
      disableDeleteAnonymousUser: true,
    }),
    limit,
  ]
}

export type Auth = ReturnType<typeof createAuth>
