import { Hono } from 'hono'
import { createAuth } from './auth'
import { clientAddress, rateLimit } from './middleware/rate-limit'
import { requireSession, type AppEnv } from './middleware/session'
import { errorReporterFromEnv } from './providers/posthog/error-reporter'
import { requestError } from './routes/errors'
import { providerKey } from './routes/provider-key'

const api = new Hono<AppEnv>()
  .use(requireSession)
  .get('/me', (c) => {
    const user = c.get('user')
    return c.json({ id: user.id, email: user.email })
  })
  .route('/me/provider-key', providerKey)

const app = new Hono<{ Bindings: Env; Variables: Partial<AppEnv['Variables']> }>()
  .post('/api/auth/*', rateLimit('AUTH_LIMITER', clientAddress))
  .on(['POST', 'GET'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))
  .route('/api', api)
  .notFound((c) => requestError(c, 'not_found'))
  .onError((error, c) => {
    c.executionCtx.waitUntil(
      errorReporterFromEnv(c.env).report(error, {
        where: `${c.req.method} ${c.req.routePath}`,
        userId: c.get('user')?.id,
      }),
    )
    return requestError(c, 'internal_error')
  })

export type AppType = typeof app

export { GenerationWorkflow } from './workflows/generation'

export default app
