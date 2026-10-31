export interface Email {
  to: string
  subject: string
  text: string
  html?: string
  idempotencyKey?: string
}

export interface Mailer {
  send(email: Email): Promise<void>
}
