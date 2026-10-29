import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestUser } from '../test/factories'
import { findSubscriptionForUser, upsertSubscription, type NewSubscription } from './subscriptions'

const db = createDb(env.DB)

describe('subscription repository', () => {
  let owner: string
  let stranger: string

  function event(patch: Partial<NewSubscription>): NewSubscription {
    return {
      id: crypto.randomUUID(),
      userId: owner,
      tier: 'pro',
      status: 'active',
      providerSubscriptionId: 'sub_1',
      lastEventAt: new Date('2030-01-02'),
      updatedAt: new Date(),
      ...patch,
    }
  }

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    await upsertSubscription(db, event({}))
  })

  it('returns a subscription to its owner', async () => {
    expect((await findSubscriptionForUser(db, owner))?.tier).toBe('pro')
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findSubscriptionForUser(db, stranger)).toBeUndefined()
  })

  it('keeps the row when an older event arrives late', async () => {
    await upsertSubscription(
      db,
      event({ tier: 'free', status: 'canceled', lastEventAt: new Date('2030-01-01') }),
    )
    expect((await findSubscriptionForUser(db, owner))?.status).toBe('active')
  })

  it('keeps a live subscription when an event for another subscription arrives', async () => {
    await upsertSubscription(
      db,
      event({ providerSubscriptionId: 'sub_old', status: 'canceled', tier: 'free' }),
    )
    expect((await findSubscriptionForUser(db, owner))?.providerSubscriptionId).toBe('sub_1')
  })
})
