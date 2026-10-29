export interface Email {
  to: string
  subject: string
  text: string
  idempotencyKey?: string
}

export interface Mailer {
  send(email: Email): Promise<void>
}
