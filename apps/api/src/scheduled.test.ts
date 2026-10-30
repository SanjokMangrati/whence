import { createScheduledController } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from './db/client'
import { user } from './db/schema'
import worker from './index'
import { insertTestUser } from './test/factories'

const db = createDb(env.DB)

describe('daily cron', () => {
  it('purges an expired demo account', async () => {
    const scheduledTime = new Date('2026-12-01T09:00:00Z')
    const userId = await insertTestUser(db)
    await db
      .update(user)
      .set({ isAnonymous: true, createdAt: new Date('2026-11-01T09:00:00Z') })
      .where(eq(user.id, userId))

    await worker.scheduled(createScheduledController({ scheduledTime, cron: '0 9 * * *' }), env)

    const [row] = await db.select().from(user).where(eq(user.id, userId))
    expect(row?.purgedAt).toEqual(scheduledTime)
  })
})
