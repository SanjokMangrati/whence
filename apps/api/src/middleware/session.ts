import { createMiddleware } from 'hono/factory'
import { createAuth } from '../auth'
import { requestError } from '../routes/errors'

export type SessionUser = { id: string; email: string; name: string }

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } }

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers })
  if (session === null) {
    return requestError(c, 'unauthorized')
  }
  c.set('user', session.user)
  await next()
})
