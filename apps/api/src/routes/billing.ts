import { Hono, type Context } from 'hono'
import { createDb } from '../db/client'
import { InvalidWebhookError } from '../domain/errors'
import type { AppEnv } from '../middleware/session'
import { createDodoPaymentProvider } from '../providers/dodo/payment-provider'
import {
  openPaymentPortal,
  readSubscription,
  receivePaymentEvent,
  setCancelAtPeriodEnd,
  startCheckout,
} from '../services/billing'
import { refusalResponse, requestError } from './errors'

function paymentProvider(env: Env) {
  return createDodoPaymentProvider({
    apiKey: env.DODO_API_KEY,
    webhookKey: env.DODO_WEBHOOK_KEY,
    environment: env.DODO_ENVIRONMENT,
    proProductId: env.DODO_PRO_PRODUCT_ID,
  })
}

export const billing = new Hono<AppEnv>()
  .get('/subscription', async (c) => {
    return c.json({
      subscription: await readSubscription(createDb(c.env.DB), c.get('user').id),
      testMode: c.env.DODO_ENVIRONMENT === 'test_mode',
    })
  })
  .post('/checkout', async (c) => {
    const user = c.get('user')
    try {
      const checkout = await startCheckout(
        { db: createDb(c.env.DB), payments: paymentProvider(c.env) },
        { userId: user.id, email: user.email, returnUrl: `${c.env.BETTER_AUTH_URL}/` },
      )
      return c.json(checkout)
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .post('/cancel', (c) => cancelAtPeriodEnd(c, true))
  .post('/resume', (c) => cancelAtPeriodEnd(c, false))
  .post('/portal', async (c) => {
    try {
      const portal = await openPaymentPortal(
        { db: createDb(c.env.DB), payments: paymentProvider(c.env) },
        c.get('user').id,
      )
      return c.json(portal)
    } catch (error) {
      return refusalResponse(c, error)
    }
  })

async function cancelAtPeriodEnd(c: Context<AppEnv>, cancel: boolean) {
  try {
    const subscription = await setCancelAtPeriodEnd(
      { db: createDb(c.env.DB), payments: paymentProvider(c.env) },
      c.get('user').id,
      cancel,
    )
    return c.json({ subscription })
  } catch (error) {
    return refusalResponse(c, error)
  }
}

export const paymentWebhooks = new Hono<{ Bindings: Env }>().post('/dodo', async (c) => {
  try {
    await receivePaymentEvent(
      { db: createDb(c.env.DB), bucket: c.env.BUCKET, payments: paymentProvider(c.env) },
      await c.req.text(),
      c.req.raw.headers,
    )
  } catch (error) {
    if (error instanceof InvalidWebhookError) return requestError(c, 'invalid_signature')
    throw error
  }
  return c.json({ received: true })
})
