import type { Email, Mailer } from '../../domain/ports'

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

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: config.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
        }),
      })
      if (!response.ok) {
        throw new Error(`Resend returned ${response.status}.`)
      }
    },
  }
}
