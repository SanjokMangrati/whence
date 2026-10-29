import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { createResendMailer } from './mailer'

const mailer = createResendMailer({ apiKey: 'test-key', from: 'Whence <mail@example.test>' })

describe('resend mailer', () => {
  it('sends the email with its idempotency key', async () => {
    const calls = stubFetch(() => Response.json({ id: 'email-1' }))

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
      from: 'Whence <mail@example.test>',
      to: ['user@example.test'],
      subject: 'Subject',
      text: 'Body',
    })
  })

  it('throws when Resend refuses the email', async () => {
    stubFetch(() => new Response('{}', { status: 422 }))

    await expect(
      mailer.send({ to: 'user@example.test', subject: 'Subject', text: 'Body' }),
    ).rejects.toThrow('Resend returned 422.')
  })
})
