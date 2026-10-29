import type { Context } from 'hono'

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
