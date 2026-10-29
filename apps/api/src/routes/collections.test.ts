import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { collectionItem } from '../db/schema'
import { upsertSubscription } from '../repositories/subscriptions'
import { insertTestArtifact, insertTestJob, insertTestSource } from '../test/factories'
import { signUp } from '../test/session'

const db = createDb(env.DB)

interface CollectionBody {
  id: string
  name: string
  jobIds: string[]
}

function call(cookie: string, method: string, path: string, body?: object) {
  return SELF.fetch(`https://example.com/api/collections${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function setPlan(userId: string, status: 'active' | 'canceled', at: string) {
  await upsertSubscription(db, {
    id: crypto.randomUUID(),
    userId,
    tier: 'pro',
    status,
    providerSubscriptionId: 'sub_1',
    lastEventAt: new Date(at),
    updatedAt: new Date(),
  })
}

async function proUser() {
  const user = await signUp()
  await setPlan(user.userId, 'active', '2026-09-29T10:00:00Z')
  return user
}

async function insertSource(userId: string) {
  const sourceId = await insertTestSource(db)
  const jobId = await insertTestJob(db, userId, sourceId)
  for (const artifactType of ['notes', 'cheat_sheet'] as const) {
    await insertTestArtifact(db, { userId, jobId, sourceId }, artifactType)
  }
  return jobId
}

async function list(cookie: string): Promise<CollectionBody[]> {
  const response = await call(cookie, 'GET', '')
  return (await response.json<{ items: CollectionBody[] }>()).items
}

describe('collection routes', () => {
  it('refuses every write for a free account by direct request', async () => {
    const { cookie } = await signUp()

    const responses = [
      await call(cookie, 'POST', '', { name: 'Biology' }),
      await call(cookie, 'PATCH', `/${crypto.randomUUID()}`, { name: 'Biology' }),
      await call(cookie, 'DELETE', `/${crypto.randomUUID()}`),
      await call(cookie, 'PUT', `/${crypto.randomUUID()}/sources/${crypto.randomUUID()}`),
      await call(cookie, 'DELETE', `/${crypto.randomUUID()}/sources/${crypto.randomUUID()}`),
    ]

    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: 'entitlement_required' })
    }
    expect(await list(cookie)).toEqual([])
  })

  it('creates, fills, renames, empties, and deletes a collection', async () => {
    const { cookie, userId } = await proUser()
    const jobId = await insertSource(userId)

    const created = await call(cookie, 'POST', '', { name: '  Biology  ' })
    expect(created.status).toBe(201)
    const { id } = await created.json<CollectionBody>()

    expect((await call(cookie, 'PUT', `/${id}/sources/${jobId}`)).status).toBe(204)
    expect((await call(cookie, 'PUT', `/${id}/sources/${jobId}`)).status).toBe(204)
    const items = await db.select().from(collectionItem).where(eq(collectionItem.collectionId, id))
    expect(items).toHaveLength(2)

    expect((await call(cookie, 'PATCH', `/${id}`, { name: 'Cells' })).status).toBe(204)
    expect(await list(cookie)).toEqual([{ id, name: 'Cells', jobIds: [jobId] }])

    expect((await call(cookie, 'DELETE', `/${id}/sources/${jobId}`)).status).toBe(204)
    expect(await list(cookie)).toEqual([{ id, name: 'Cells', jobIds: [] }])

    await call(cookie, 'PUT', `/${id}/sources/${jobId}`)
    expect((await call(cookie, 'DELETE', `/${id}`)).status).toBe(204)
    expect(await list(cookie)).toEqual([])
    expect(
      await db.select().from(collectionItem).where(eq(collectionItem.collectionId, id)),
    ).toEqual([])
  })

  it('keeps a downgraded account collections readable and read-only', async () => {
    const { cookie, userId } = await proUser()
    const jobId = await insertSource(userId)
    const { id } = await (
      await call(cookie, 'POST', '', { name: 'Biology' })
    ).json<CollectionBody>()
    await call(cookie, 'PUT', `/${id}/sources/${jobId}`)

    await setPlan(userId, 'canceled', '2026-10-29T00:00:00Z')

    expect(await list(cookie)).toEqual([{ id, name: 'Biology', jobIds: [jobId] }])
    for (const response of [
      await call(cookie, 'PATCH', `/${id}`, { name: 'Renamed' }),
      await call(cookie, 'DELETE', `/${id}/sources/${jobId}`),
      await call(cookie, 'DELETE', `/${id}`),
    ]) {
      expect(response.status).toBe(403)
    }
    expect(await list(cookie)).toEqual([{ id, name: 'Biology', jobIds: [jobId] }])
  })

  it('does not reach another user collection or source', async () => {
    const owner = await proUser()
    const other = await proUser()
    const ownerJob = await insertSource(owner.userId)
    const { id } = await (
      await call(owner.cookie, 'POST', '', { name: 'Biology' })
    ).json<CollectionBody>()
    const { id: otherId } = await (
      await call(other.cookie, 'POST', '', { name: 'Mine' })
    ).json<CollectionBody>()

    expect((await call(other.cookie, 'PATCH', `/${id}`, { name: 'Taken' })).status).toBe(404)
    expect((await call(other.cookie, 'DELETE', `/${id}`)).status).toBe(404)
    expect((await call(other.cookie, 'PUT', `/${id}/sources/${ownerJob}`)).status).toBe(404)
    expect((await call(other.cookie, 'PUT', `/${otherId}/sources/${ownerJob}`)).status).toBe(404)
    expect(await list(owner.cookie)).toEqual([{ id, name: 'Biology', jobIds: [] }])
  })

  it('refuses an empty or long name', async () => {
    const { cookie } = await proUser()
    expect((await call(cookie, 'POST', '', { name: '   ' })).status).toBe(400)
    expect((await call(cookie, 'POST', '', { name: 'x'.repeat(81) })).status).toBe(400)
  })
})
