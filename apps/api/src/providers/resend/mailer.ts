import type { Email, Mailer } from '../../domain/ports'

const RETRY_DELAYS_MS = [1000, 2000]

export interface ResendConfig {
  apiKey: string
  from: string
}

export function createResendMailer(config: ResendConfig): Mailer {
  return {
    async send(email: Email) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      }
      if (email.idempotencyKey !== undefined) headers['idempotency-key'] = email.idempotencyKey

      const response = await post(
        headers,
        {
          from: config.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
        },
        email.idempotencyKey !== undefined,
      )
      if (!response.ok) {
        throw new Error(`Resend returned ${response.status}.`)
      }
    },
  }
}

async function post(
  headers: Record<string, string>,
  email: object,
  keyed: boolean,
): Promise<Response> {
  const body = JSON.stringify(email)
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers, body })
    const delay = RETRY_DELAYS_MS[attempt]
    const retryable = response.status === 429 || (keyed && response.status >= 500)
    if (!retryable || delay === undefined) {
      return response
    }
    await response.body?.cancel()
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
