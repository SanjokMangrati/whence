import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from './db/client'
import { upsertSubscription } from './repositories/subscriptions'
import { reserveSourceSlot } from './services/quota'
import { signUp } from './test/session'

const db = createDb(env.DB)

async function me(cookie: string) {
  return (await SELF.fetch('https://example.com/api/me', { headers: { cookie } })).json()
}

describe('me route', () => {
  it('shows the plan and the sources used in its period', async () => {
    const { cookie, userId } = await signUp()
    const now = new Date()
    const jobId = crypto.randomUUID()
    await reserveSourceSlot(db, {
      plan: 'free',
      now,
      job: {
        id: jobId,
        userId,
        requestedUrl: 'https://example.com/post',
        outputType: 'notes',
        workflowInstanceId: jobId,
        createdAt: now,
        updatedAt: now,
      },
    })

    expect(await me(cookie)).toMatchObject({
      id: userId,
      plan: 'free',
      quotaPeriod: 'month',
      sourcesUsed: 1,
      sourcesPerPeriod: 3,
    })

    await upsertSubscription(db, {
      id: crypto.randomUUID(),
      userId,
      tier: 'pro',
      status: 'active',
      providerSubscriptionId: 'sub_1',
      lastEventAt: now,
      updatedAt: now,
    })

    expect(await me(cookie)).toMatchObject({ plan: 'pro', sourcesUsed: 1, sourcesPerPeriod: 20 })
  })
})
