import { hc } from 'hono/client'
import type { AppType } from 'api/src/index'

export const api = hc<AppType>('/').api

export async function readErrorCode(
  response: { json(): Promise<unknown> } | null,
): Promise<string | null> {
  if (response === null) return null
  const body = await response.json().catch(() => null)
  return typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
    ? body.error
    : null
}
