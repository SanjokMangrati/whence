import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { providerKey } from '../db/schema'
import { saveProviderKey } from '../repositories/provider-keys'
import { insertTestJob, insertTestSource, insertTestUser } from '../test/factories'
import { providerKeyForJob, providerKeyStatus, storeProviderKey } from './provider-keys'

const db = createDb(env.DB)
const secret = env.KEY_ENCRYPTION_SECRET
const KEY = 'sk-ant-api03-visitor-key-for-tests-only-AbCd'

async function storedRow(userId: string) {
  const [row] = await db.select().from(providerKey).where(eq(providerKey.userId, userId))
  return row!
}

describe('provider key service', () => {
  let owner: string
  let ownerJob: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    ownerJob = await insertTestJob(db, owner, await insertTestSource(db))
  })

  it('stores the key encrypted and returns only its last four characters', async () => {
    expect(await storeProviderKey(db, secret, owner, KEY)).toEqual({ set: true, last4: 'AbCd' })

    expect(JSON.stringify(await storedRow(owner))).not.toContain('visitor-key')
    expect(await providerKeyStatus(db, owner)).toEqual({ set: true, last4: 'AbCd' })
    expect(await providerKeyForJob(db, secret, ownerJob)).toBe(KEY)
  })

  it('uses a new nonce for each save of the same key', async () => {
    await storeProviderKey(db, secret, owner, KEY)
    const first = await storedRow(owner)
    await storeProviderKey(db, secret, owner, KEY)
    const second = await storedRow(owner)

    expect(second.iv).not.toBe(first.iv)
    expect(second.ciphertext).not.toBe(first.ciphertext)
  })

  it('refuses a ciphertext copied to another user', async () => {
    const stranger = await insertTestUser(db)
    const strangerJob = await insertTestJob(db, stranger, await insertTestSource(db))
    await storeProviderKey(db, secret, owner, KEY)
    await saveProviderKey(db, { ...(await storedRow(owner)), userId: stranger })

    await expect(providerKeyForJob(db, secret, strangerJob)).rejects.toMatchObject({
      name: 'OperationError',
    })
  })

  it('reports a job whose owner has no key', async () => {
    expect(await providerKeyStatus(db, owner)).toEqual({ set: false, last4: null })
    await expect(providerKeyForJob(db, secret, ownerJob)).rejects.toMatchObject({
      code: 'provider_key_required',
    })
  })
})
