import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createAuth } from './auth'
import { createDb } from './db/client'
import { user } from './db/schema'
import { stubFetch } from './test/fetch'

const db = createDb(env.DB)
const demoAuth = createAuth({ ...env, TURNSTILE_SECRET_KEY: 'test-turnstile-secret' })

interface Siteverify {
  success: boolean
  action?: string
  hostname?: string
}

function answerSiteverify(result: Siteverify) {
  const bodies: Record<string, string>[] = []
  stubFetch(async (request) => {
    expect(request.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    bodies.push(await request.json())
    return Response.json(result)
  })
  return bodies
}

function createDemoAccount(address: string, token?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'https://example.com',
    'x-client-ip': address,
  }
  if (token !== undefined) headers['x-captcha-response'] = token
  return demoAuth.handler(
    new Request('https://example.com/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers,
      body: '{}',
    }),
  )
}

const PASSED = { success: true, action: 'demo_account', hostname: 'example.com' }

describe('demo accounts', () => {
  it('are off without a Turnstile secret', async () => {
    const res = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: '{}',
    })
    expect(res.status).toBe(404)
  })

  it('creates a demo user with a session after Turnstile passes', async () => {
    const bodies = answerSiteverify(PASSED)

    const res = await createDemoAccount('203.0.113.20', 'turnstile-token')
    expect(res.status).toBe(200)
    expect(bodies).toEqual([
      { secret: 'test-turnstile-secret', response: 'turnstile-token', remoteip: '203.0.113.20' },
    ])

    const cookie = res.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const session = await demoAuth.api.getSession({ headers: new Headers({ cookie }) })
    const [demoUser] = await db
      .select({ email: user.email, isAnonymous: user.isAnonymous })
      .from(user)
      .where(eq(user.id, session!.user.id))
    expect(demoUser!.isAnonymous).toBe(true)
    expect(demoUser!.email).toMatch(/^demo-[0-9a-f-]{36}@demo\.invalid$/)
  })

  it('refuses a request with no Turnstile token', async () => {
    const bodies = answerSiteverify(PASSED)

    const res = await createDemoAccount('203.0.113.21')
    expect(res.status).toBe(400)
    expect(bodies).toHaveLength(0)
  })

  it.each([
    ['a failed check', { success: false }, '203.0.113.30'],
    ['a token for another action', { ...PASSED, action: 'login' }, '203.0.113.31'],
    ['a token for another site', { ...PASSED, hostname: 'other.example' }, '203.0.113.32'],
  ])('refuses %s without spending the address limit', async (_, result, address) => {
    answerSiteverify(result)
    expect((await createDemoAccount(address, 'turnstile-token')).status).toBe(403)

    answerSiteverify(PASSED)
    const statuses = []
    for (let attempt = 0; attempt < 3; attempt++) {
      statuses.push((await createDemoAccount(address, 'turnstile-token')).status)
    }
    expect(statuses).toEqual([200, 200, 200])
  })

  it('allows three accounts for each address in a day', async () => {
    answerSiteverify(PASSED)

    const statuses = []
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await createDemoAccount('203.0.113.23', 'turnstile-token')).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])

    const otherAddress = await createDemoAccount('203.0.113.24', 'turnstile-token')
    expect(otherAddress.status).toBe(200)
  })
})

describe('email accounts with demo accounts on', () => {
  function postDemoAuth(path: string, body: Record<string, string>) {
    return demoAuth.handler(
      new Request(`https://example.com/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://example.com' },
        body: JSON.stringify(body),
      }),
    )
  }

  it.each([
    [
      '/sign-up/email',
      { email: 'visitor@example.test', password: 'correct horse battery staple', name: 'Visitor' },
      'EMAIL_PASSWORD_SIGN_UP_DISABLED',
    ],
    [
      '/sign-in/email',
      { email: 'visitor@example.test', password: 'correct horse battery staple' },
      'EMAIL_PASSWORD_DISABLED',
    ],
    ['/request-password-reset', { email: 'visitor@example.test' }, 'RESET_PASSWORD_DISABLED'],
    [
      '/send-verification-email',
      { email: 'visitor@example.test' },
      'VERIFICATION_EMAIL_NOT_ENABLED',
    ],
  ])('refuses %s', async (path, body, code) => {
    const sent = stubFetch(async () => Response.json({ id: 'email' }))

    const res = await postDemoAuth(path, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
    expect(sent).toHaveLength(0)
  })
})
