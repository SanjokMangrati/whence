import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import type { PaymentProvider } from '../domain/ports'
import { upsertSubscription } from '../repositories/subscriptions'
import { insertTestUser } from '../test/factories'
import { openPaymentPortal, readSubscription, setCancelAtPeriodEnd, startCheckout } from './billing'

const db = createDb(env.DB)
const PERIOD_END = new Date('2026-10-29T00:00:00Z')

function recordingProvider() {
  const calls: unknown[][] = []
  const payments: PaymentProvider = {
    createCheckout: async (request) => {
      calls.push(['createCheckout', request.userId])
      return { url: 'https://checkout.test' }
    },
    setCancelAtPeriodEnd: async (...args) => {
      calls.push(['setCancelAtPeriodEnd', ...args])
    },
    createPortalSession: async (customerId) => {
      calls.push(['createPortalSession', customerId])
      return { url: `https://portal.test/${customerId}` }
    },
    parseWebhook: () => {
      throw new Error('The billing service test sends no webhook.')
    },
  }
  return { payments, calls }
}

async function subscribedUser(status: 'active' | 'past_due' | 'canceled') {
  const userId = await insertTestUser(db)
  await upsertSubscription(db, {
    id: crypto.randomUUID(),
    userId,
    tier: 'pro',
    status,
    providerCustomerId: 'cus_1',
    providerSubscriptionId: 'sub_1',
    currentPeriodEnd: PERIOD_END,
    lastEventAt: new Date(),
    updatedAt: new Date(),
  })
  return userId
}

describe('billing service', () => {
  it('schedules a cancellation at the provider and leaves the row to the webhook', async () => {
    const userId = await subscribedUser('active')
    const { payments, calls } = recordingProvider()

    const result = await setCancelAtPeriodEnd({ db, payments }, userId, true)

    expect(calls).toEqual([['setCancelAtPeriodEnd', 'sub_1', true]])
    expect(result).toEqual({
      status: 'active',
      currentPeriodEnd: PERIOD_END,
      cancelAtPeriodEnd: true,
    })
    expect(await readSubscription(db, userId)).toMatchObject({ cancelAtPeriodEnd: false })
  })

  it('refuses to cancel without an active subscription and calls no provider', async () => {
    const freeUser = await insertTestUser(db)
    const heldUser = await subscribedUser('past_due')
    const { payments, calls } = recordingProvider()

    for (const userId of [freeUser, heldUser]) {
      await expect(setCancelAtPeriodEnd({ db, payments }, userId, true)).rejects.toMatchObject({
        code: 'no_subscription',
      })
    }
    expect(calls).toEqual([])
  })

  it('opens the payment portal for a subscription on hold', async () => {
    const userId = await subscribedUser('past_due')
    const { payments } = recordingProvider()

    expect(await openPaymentPortal({ db, payments }, userId)).toEqual({
      url: 'https://portal.test/cus_1',
    })
  })

  it('shows a canceled subscription as none and lets the user check out again', async () => {
    const userId = await subscribedUser('canceled')
    const { payments, calls } = recordingProvider()

    expect(await readSubscription(db, userId)).toBeNull()
    await expect(openPaymentPortal({ db, payments }, userId)).rejects.toMatchObject({
      code: 'no_subscription',
    })
    await startCheckout({ db, payments }, { userId, email: 'a@example.test', returnUrl: '/' })
    expect(calls).toEqual([['createCheckout', userId]])
  })

  it('refuses a second checkout while a subscription is on hold', async () => {
    const userId = await subscribedUser('past_due')
    const { payments, calls } = recordingProvider()

    await expect(
      startCheckout({ db, payments }, { userId, email: 'a@example.test', returnUrl: '/' }),
    ).rejects.toMatchObject({ code: 'already_subscribed' })
    expect(calls).toEqual([])
  })
})
