import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

export async function signUp(): Promise<{ cookie: string; userId: string }> {
  const email = `${crypto.randomUUID()}@example.test`
  const password = 'correct horse battery staple'
  const headers = {
    'content-type': 'application/json',
    origin: 'https://example.com',
    'x-client-ip': crypto.randomUUID(),
  }
  await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, name: 'Test User' }),
  })
  await env.DB.prepare('UPDATE user SET email_verified = 1 WHERE email = ?').bind(email).run()
  const response = await SELF.fetch('https://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  })
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const me = await SELF.fetch('https://example.com/api/me', { headers: { cookie } })
  return { cookie, userId: (await me.json<{ id: string }>()).id }
}
