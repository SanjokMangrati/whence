import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResendMailer } from './mailer'

const mailer = createResendMailer({ apiKey: 'test-key', from: 'csm <mail@example.test>' })
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('resend mailer', () => {
  it('sends the email with its idempotency key', async () => {
    const calls: Request[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init))
      return Response.json({ id: 'email-1' })
    }) as typeof fetch

    await mailer.send({
      to: 'user@example.test',
      subject: 'Subject',
      text: 'Body',
      idempotencyKey: 'reminder/user-1/2026-10-01',
    })

    expect(calls).toHaveLength(1)
    const [request] = calls
    expect(request!.url).toBe('https://api.resend.com/emails')
    expect(request!.headers.get('authorization')).toBe('Bearer test-key')
    expect(request!.headers.get('idempotency-key')).toBe('reminder/user-1/2026-10-01')
    expect(await request!.json()).toEqual({
      from: 'csm <mail@example.test>',
      to: ['user@example.test'],
      subject: 'Subject',
      text: 'Body',
    })
  })

  it('throws when Resend refuses the email', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 422 })) as typeof fetch

    await expect(
      mailer.send({ to: 'user@example.test', subject: 'Subject', text: 'Body' }),
    ).rejects.toThrow('Resend returned 422.')
  })
})
