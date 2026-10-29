import { SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

const jsonHeaders = {
  'content-type': 'application/json',
  origin: 'https://example.com',
  'x-client-ip': '203.0.113.1',
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

describe('better auth over D1', () => {
  it('supports signup, email verification, a persisted session, logout, login, and password reset', async () => {
    const emails: { to: string[]; text: string }[] = []
    const realFetch = globalThis.fetch
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        if (request.url !== 'https://api.resend.com/emails') return realFetch(input, init)
        emails.push(await request.json())
        return Response.json({ id: `email-${emails.length}` })
      })
    const email = `${crypto.randomUUID()}@example.test`
    const password = 'correct horse battery staple'

    const signUpRes = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password, name: 'Test User', callbackURL: '/verify-email' }),
    })
    expect(signUpRes.status).toBe(200)
    expect(cookieHeaderFrom(signUpRes)).toBe('')

    const unverifiedSignInRes = await SELF.fetch('https://example.com/api/auth/sign-in/email', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    })
    expect(unverifiedSignInRes.status).toBe(403)
    expect(await unverifiedSignInRes.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })

    await vi.waitFor(() => expect(emails).toHaveLength(2))
    expect(emails[0]!.to).toEqual([email])
    const verifyUrl = emails[0]!.text.match(/https:\/\/\S+/)![0]

    const verifyRes = await SELF.fetch(verifyUrl, { redirect: 'manual' })
    expect(verifyRes.status).toBe(302)
    expect(verifyRes.headers.get('location')).toBe('/verify-email')
    const verifiedCookie = cookieHeaderFrom(verifyRes)
    expect(verifiedCookie).not.toBe('')

    const sessionRes = await SELF.fetch('https://example.com/api/auth/get-session', {
      headers: { cookie: verifiedCookie },
    })
    expect(sessionRes.status).toBe(200)
    const session = await sessionRes.json<{ user: { email: string; emailVerified: boolean } }>()
    expect(session.user).toMatchObject({ email, emailVerified: true })

    const signOutRes = await SELF.fetch('https://example.com/api/auth/sign-out', {
      method: 'POST',
      headers: { ...jsonHeaders, cookie: verifiedCookie },
    })
    expect(signOutRes.status).toBe(200)

    const afterSignOutRes = await SELF.fetch('https://example.com/api/auth/get-session', {
      headers: { cookie: verifiedCookie },
    })
    expect(await afterSignOutRes.json()).toBeNull()

    const signInRes = await SELF.fetch('https://example.com/api/auth/sign-in/email', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    })
    expect(signInRes.status).toBe(200)
    const signedInCookie = cookieHeaderFrom(signInRes)
    expect(signedInCookie).not.toBe('')

    const forgetPasswordRes = await SELF.fetch(
      'https://example.com/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email, redirectTo: 'https://example.com/reset' }),
      },
    )
    expect(forgetPasswordRes.status).toBe(200)

    await vi.waitFor(() => expect(emails).toHaveLength(3))
    expect(emails[2]!.to).toEqual([email])
    const token = emails[2]!.text.split('/reset-password/')[1]!.split('?')[0]!

    fetchSpy.mockRestore()

    const newPassword = 'new correct horse battery staple'
    const resetRes = await SELF.fetch('https://example.com/api/auth/reset-password', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ newPassword, token }),
    })
    expect(resetRes.status).toBe(200)

    const afterResetRes = await SELF.fetch('https://example.com/api/auth/get-session', {
      headers: { cookie: signedInCookie },
    })
    expect(await afterResetRes.json()).toBeNull()

    const signInWithNewPasswordRes = await SELF.fetch(
      'https://example.com/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email, password: newPassword }),
      },
    )
    expect(signInWithNewPasswordRes.status).toBe(200)
  })

  it('refuses auth requests from one address over the limit', async () => {
    function signOut(address: string) {
      return SELF.fetch('https://example.com/api/auth/sign-out', {
        method: 'POST',
        headers: { ...jsonHeaders, 'x-client-ip': address },
      })
    }

    const statuses = await Promise.all(
      Array.from({ length: 21 }, async () => (await signOut('203.0.113.2')).status),
    )
    expect(statuses.filter((status) => status === 429)).toHaveLength(1)

    expect((await signOut('203.0.113.3')).status).not.toBe(429)
  })
})
