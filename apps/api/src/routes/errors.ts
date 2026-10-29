import type { Context } from 'hono'
import { DomainError, PlanError } from '../domain/errors'

const REQUEST_STATUS = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  internal_error: 500,
} as const

export type RequestErrorCode = keyof typeof REQUEST_STATUS

export function requestError<Code extends RequestErrorCode>(c: Context, code: Code) {
  return c.json({ error: code }, REQUEST_STATUS[code])
}

const PLAN_STATUS = {
  quota_exceeded: 429,
  daily_limit_reached: 429,
  too_many_running: 429,
  entitlement_required: 403,
  already_subscribed: 409,
  no_subscription: 409,
} as const

export function refusalResponse(c: Context, error: unknown) {
  if (error instanceof PlanError) {
    return c.json({ error: error.code }, PLAN_STATUS[error.code])
  }
  if (error instanceof DomainError) {
    return c.json({ error: error.code }, error.code === 'provider_key_required' ? 402 : 400)
  }
  throw error
}
