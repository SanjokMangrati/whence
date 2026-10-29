import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { user } from '../db/schema'
import { upsertSubscription } from '../repositories/subscriptions'
import { insertTestUser } from '../test/factories'
import { requireEntitlement, resolvePlan } from './plans'

const db = createDb(env.DB)

describe('plan resolution', () => {
  let userId: string

  const subscribe = (status: 'active' | 'canceled') =>
    upsertSubscription(db, {
      id: crypto.randomUUID(),
      userId,
      tier: 'pro',
      status,
      providerSubscriptionId: 'sub_1',
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })

  beforeEach(async () => {
    userId = await insertTestUser(db)
  })

  it('puts a user with no subscription on the free plan', async () => {
    expect(await resolvePlan(db, userId)).toBe('free')
  })

  it('gives an active subscription its tier', async () => {
    await subscribe('active')

    expect(await resolvePlan(db, userId)).toBe('pro')
  })

  it('puts a canceled subscription on the free plan', async () => {
    await subscribe('canceled')

    expect(await resolvePlan(db, userId)).toBe('free')
  })

  it('puts a demo account on the demo plan', async () => {
    await db.update(user).set({ isAnonymous: true }).where(eq(user.id, userId))

    expect(await resolvePlan(db, userId)).toBe('demo')
  })

  it('refuses a capability the plan does not include', () => {
    expect(() => requireEntitlement('free', 'export')).toThrow(
      expect.objectContaining({ code: 'entitlement_required' }),
    )
    expect(() => requireEntitlement('demo', 'export')).not.toThrow()
  })
})
