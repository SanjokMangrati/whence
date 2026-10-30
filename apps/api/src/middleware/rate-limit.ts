import { getIP } from 'better-auth/api'
import type { Context, Env as HonoEnv } from 'hono'
import { createMiddleware } from 'hono/factory'
import { requestError } from '../routes/errors'
import type { AppEnv } from './session'

type Limiter = { [Key in keyof Env]-?: Env[Key] extends RateLimit ? Key : never }[keyof Env]

export function rateLimit<E extends HonoEnv & { Bindings: Env }>(
  limiter: Limiter,
  keyOf: (c: Context<E>) => string,
) {
  return createMiddleware<E>(async (c, next) => {
    const { success } = await c.env[limiter].limit({ key: keyOf(c) })
    if (!success) {
      return requestError(c, 'rate_limited')
    }
    await next()
  })
}

export const CLIENT_ADDRESS = { ipAddressHeaders: ['x-client-ip'] }

export function clientAddress(c: Context<{ Bindings: Env }>): string {
  return getIP(c.req.raw, { advanced: { ipAddress: CLIENT_ADDRESS } }) ?? 'local'
}

export function signedInUser(c: Context<AppEnv>): string {
  return c.get('user').id
}
