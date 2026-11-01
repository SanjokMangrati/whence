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
  const demoAccounts =
    env.TURNSTILE_SECRET_KEY === undefined
      ? null
      : { secretKey: env.TURNSTILE_SECRET_KEY, hostname: new URL(env.BETTER_AUTH_URL).hostname }

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: CLIENT_ADDRESS,
      backgroundTasks: { handler: waitUntil },
    },
    emailAndPassword:
      demoAccounts === null
        ? {
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
          }
        : { enabled: false },
    emailVerification:
      demoAccounts === null
        ? {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: ({ user, url }) =>
              send(
                {
                  to: user.email,
                  subject: 'Confirm your Whence email',
                  text: [
                    `Please verify your email to complete sign up: ${url}`,
                    'The link works for 1 hour. If you did not sign up, you can ignore this email.',
                  ].join('\n\n'),
                  html: verificationEmailHtml(url),
                },
                'email_verification',
                user.id,
              ),
          }
        : undefined,
    plugins: demoAccounts === null ? [] : demoAccountPlugins(db, demoAccounts),
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

function verificationEmailHtml(url: string) {
  const href = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf9f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #dedbd6;border-radius:8px;">
            <tr>
              <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1a16;font-size:16px;line-height:24px;">
                <p style="margin:0 0 24px;">Please verify your email to complete sign up.</p>
                <a href="${href}" style="display:inline-block;padding:12px 20px;background:#1c1a16;color:#faf9f6;border-radius:4px;font-weight:600;text-decoration:none;">Verify Email</a>
                <p style="margin:24px 0 0;color:#6b675f;font-size:14px;line-height:20px;">The link works for 1 hour. If you did not sign up, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export type Auth = ReturnType<typeof createAuth>
