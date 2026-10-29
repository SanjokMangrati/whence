import type { Context, Env as HonoEnv } from 'hono'
import { createMiddleware } from 'hono/factory'
import { requestError } from '../routes/errors'

type Limiter = { [Key in keyof Env]: Env[Key] extends RateLimit ? Key : never }[keyof Env]

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

export const CLIENT_ADDRESS_HEADER = 'x-client-ip'

export function clientAddress(c: Context<{ Bindings: Env }>): string {
  return c.req.header(CLIENT_ADDRESS_HEADER) ?? 'local'
}
