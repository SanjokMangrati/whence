import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { webhookEvent } from '../db/schema'
import app from '../index'
import { getText, webhookPayloadKey } from '../repositories/blobs'
import { findSubscriptionForUser, upsertSubscription } from '../repositories/subscriptions'
import { resolvePlan } from '../services/plans'
import { dodoPayload, signedHeaders, type DodoTestEvent } from '../test/dodo'
import { signUp } from '../test/session'

const db = createDb(env.DB)

function deliver(
  eventId: string,
  body: string,
  headers = signedHeaders(env.DODO_WEBHOOK_KEY, eventId, body),
) {
  return SELF.fetch('https://example.com/api/webhooks/dodo', { method: 'POST', headers, body })
}

function subscriptionEvent(
  userId: string,
  status: string,
  occurredAt: string,
  subscriptionId?: string,
): string {
  const event: DodoTestEvent = {
    type: status === 'active' ? 'subscription.active' : 'subscription.cancelled',
    occurredAt: new Date(occurredAt),
    status,
    userId,
    subscriptionId,
  }
  return dodoPayload(event)
}

async function eventRows(eventId: string) {
  return db.select().from(webhookEvent).where(eq(webhookEvent.providerEventId, eventId))
}

describe('payment webhook route', () => {
  it('applies a signed event without a session and keeps the raw payload', async () => {
    const { userId } = await signUp()
    const eventId = crypto.randomUUID()
    const body = subscriptionEvent(userId, 'active', '2026-09-29T10:00:00Z')

    const response = await deliver(eventId, body)

    expect(response.status).toBe(200)
    expect(await resolvePlan(db, userId)).toBe('pro')
    expect(await getText(env.BUCKET, webhookPayloadKey(eventId))).toBe(body)
    const [row] = await eventRows(eventId)
    expect(row?.processedAt).not.toBeNull()
  })

  it('applies a redelivered event once', async () => {
    const { userId } = await signUp()
    const eventId = crypto.randomUUID()
    const active = subscriptionEvent(userId, 'active', '2026-09-29T10:00:00Z')
    await deliver(eventId, active)
    const [first] = await eventRows(eventId)
    await deliver(
      crypto.randomUUID(),
      subscriptionEvent(userId, 'cancelled', '2026-09-29T11:00:00Z'),
    )

    const redelivered = await deliver(eventId, active)

    expect(redelivered.status).toBe(200)
    expect(await eventRows(eventId)).toEqual([first])
    expect(await resolvePlan(db, userId)).toBe('free')
  })

  it('converges to the newest state when events arrive out of order', async () => {
    const { userId } = await signUp()
    await deliver(
      crypto.randomUUID(),
      subscriptionEvent(userId, 'cancelled', '2026-09-29T11:00:00Z'),
    )
    await deliver(crypto.randomUUID(), subscriptionEvent(userId, 'active', '2026-09-29T10:00:00Z'))

    const row = await findSubscriptionForUser(db, userId)
    expect(row?.status).toBe('canceled')
    expect(row?.lastEventAt).toEqual(new Date('2026-09-29T11:00:00Z'))
    expect(await resolvePlan(db, userId)).toBe('free')
  })

  it('keeps a new subscription when a late event for the old one arrives', async () => {
    const { userId } = await signUp()
    for (const [status, occurredAt, subscriptionId] of [
      ['active', '2026-09-29T10:00:00Z', 'sub_old'],
      ['cancelled', '2026-09-29T11:00:00Z', 'sub_old'],
      ['active', '2026-09-29T12:00:00Z', 'sub_new'],
      ['expired', '2026-09-29T13:00:00Z', 'sub_old'],
    ] as const) {
      await deliver(
        crypto.randomUUID(),
        subscriptionEvent(userId, status, occurredAt, subscriptionId),
      )
    }

    const row = await findSubscriptionForUser(db, userId)
    expect(row?.providerSubscriptionId).toBe('sub_new')
    expect(await resolvePlan(db, userId)).toBe('pro')
  })

  it('refuses a bad signature and records nothing', async () => {
    const { userId } = await signUp()
    const eventId = crypto.randomUUID()
    const body = subscriptionEvent(userId, 'active', '2026-09-29T10:00:00Z')
    const headers = signedHeaders(env.DODO_WEBHOOK_KEY, eventId, body)
    headers.set('webhook-signature', 'v1,AAAA')

    const response = await deliver(eventId, body, headers)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'invalid_signature' })
    expect(await eventRows(eventId)).toEqual([])
    expect(await env.BUCKET.get(webhookPayloadKey(eventId))).toBeNull()
    expect(await resolvePlan(db, userId)).toBe('free')
  })

  it('leaves a failed event unprocessed so a redelivery applies it', async () => {
    const eventId = crypto.randomUUID()
    const body = dodoPayload({
      type: 'subscription.active',
      occurredAt: new Date('2026-09-29T10:00:00Z'),
      userId: 'user-that-does-not-exist',
    })

    const response = await deliver(eventId, body)

    expect(response.status).toBe(500)
    const [row] = await eventRows(eventId)
    expect(row?.processedAt).toBeNull()
  })
})

describe('subscription routes', () => {
  it('shows a scheduled cancellation from the webhook', async () => {
    const { cookie, userId } = await signUp()
    await deliver(
      crypto.randomUUID(),
      dodoPayload({
        type: 'subscription.updated',
        occurredAt: new Date('2026-09-29T10:00:00Z'),
        userId,
        cancelAtNextBillingDate: true,
      }),
    )

    const response = await SELF.fetch('https://example.com/api/billing/subscription', {
      headers: { cookie },
    })

    expect(await response.json()).toEqual({
      subscription: {
        status: 'active',
        currentPeriodEnd: '2026-10-29T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      },
      testMode: false,
    })
    expect(await resolvePlan(db, userId)).toBe('pro')
  })

  it('says when payments run in test mode', async () => {
    const { cookie } = await signUp()

    const response = await app.request(
      'https://example.com/api/billing/subscription',
      { headers: { cookie } },
      { ...env, DODO_ENVIRONMENT: 'test_mode' },
    )

    expect(await response.json()).toEqual({ subscription: null, testMode: true })
  })

  it('refuses to cancel or open the portal for a free account', async () => {
    const { cookie } = await signUp()
    for (const path of ['cancel', 'resume', 'portal']) {
      const response = await SELF.fetch(`https://example.com/api/billing/${path}`, {
        method: 'POST',
        headers: { cookie },
      })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: 'no_subscription' })
    }
  })
})

describe('checkout route', () => {
  it('refuses a user who already has a subscription', async () => {
    const { cookie, userId } = await signUp()
    await upsertSubscription(db, {
      id: crypto.randomUUID(),
      userId,
      tier: 'pro',
      status: 'past_due',
      updatedAt: new Date(),
    })

    const response = await SELF.fetch('https://example.com/api/billing/checkout', {
      method: 'POST',
      headers: { cookie },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'already_subscribed' })
  })

  it('refuses a request with no session', async () => {
    const response = await SELF.fetch('https://example.com/api/billing/checkout', {
      method: 'POST',
    })
    expect(response.status).toBe(401)
  })
})
