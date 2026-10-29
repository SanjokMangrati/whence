export const DOMAIN_ERROR_CODES = [
  'unsupported_source',
  'private_address',
  'source_too_long',
  'captions_unavailable',
  'extraction_failed',
  'provider_key_required',
  'generation_failed',
  'verifier_request_failed',
  'verification_failed',
  'too_many_claims',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export type PlanErrorCode =
  | 'quota_exceeded'
  | 'daily_limit_reached'
  | 'too_many_running'
  | 'entitlement_required'
  | 'already_subscribed'
  | 'no_subscription'

export class PlanError extends Error {
  constructor(
    readonly code: PlanErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PlanError'
  }
}

export class ExportError extends Error {
  readonly code = 'export_unsupported_text'

  constructor(message: string) {
    super(message)
    this.name = 'ExportError'
  }
}

export class InvalidWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidWebhookError'
  }
}
