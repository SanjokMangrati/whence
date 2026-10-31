import { describe, expect, it, vi } from 'vitest'
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

  it('sends again after Resend limits the request rate', async () => {
    vi.useFakeTimers()
    const responses = [new Response('{}', { status: 429 }), Response.json({ id: 'email-1' })]
    const requests = stubFetch(() => responses.shift()!)

    const sent = mailer.send({ to: 'user@example.test', subject: 'Subject', text: 'Body' })
    await vi.runAllTimersAsync()

    await expect(sent).resolves.toBeUndefined()
    expect(requests).toHaveLength(2)
    vi.useRealTimers()
  })

  it('sends a keyed email again after a Resend server error', async () => {
    vi.useFakeTimers()
    const responses = [new Response('{}', { status: 500 }), Response.json({ id: 'email-1' })]
    const requests = stubFetch(() => responses.shift()!)

    const sent = mailer.send({
      to: 'user@example.test',
      subject: 'Subject',
      text: 'Body',
      idempotencyKey: 'reminder/user-1/2026-10-01',
    })
    await vi.runAllTimersAsync()

    await expect(sent).resolves.toBeUndefined()
    expect(requests).toHaveLength(2)
    expect(requests[1]!.headers.get('idempotency-key')).toBe('reminder/user-1/2026-10-01')
    vi.useRealTimers()
  })

  it('does not send an email without a key again after a Resend server error', async () => {
    const requests = stubFetch(() => new Response('{}', { status: 500 }))

    await expect(
      mailer.send({ to: 'user@example.test', subject: 'Subject', text: 'Body' }),
    ).rejects.toThrow('Resend returned 500.')
    expect(requests).toHaveLength(1)
  })

  it('throws when Resend still limits the rate after two retries', async () => {
    vi.useFakeTimers()
    const requests = stubFetch(() => new Response('{}', { status: 429 }))

    const sent = mailer.send({ to: 'user@example.test', subject: 'Subject', text: 'Body' })
    const failed = expect(sent).rejects.toThrow('Resend returned 429.')
    await vi.runAllTimersAsync()
    await failed
    expect(requests).toHaveLength(3)
    vi.useRealTimers()
  })
})
