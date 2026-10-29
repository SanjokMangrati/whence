import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestJob, insertTestSource, insertTestUser } from '../test/factories'
import {
  deleteProviderKeyForUser,
  findProviderKeyForJob,
  findProviderKeyHintForUser,
  saveProviderKey,
} from './provider-keys'

const db = createDb(env.DB)

describe('provider key repository', () => {
  let owner: string
  let stranger: string
  let ownerJob: string
  let strangerJob: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    const sourceId = await insertTestSource(db)
    ownerJob = await insertTestJob(db, owner, sourceId)
    strangerJob = await insertTestJob(db, stranger, sourceId)
    await saveProviderKey(db, {
      userId: owner,
      ciphertext: 'owner-ciphertext',
      iv: 'owner-iv',
      last4: 'AbCd',
      createdAt: new Date(),
    })
  })

  it('returns the key hint to its owner', async () => {
    expect(await findProviderKeyHintForUser(db, owner)).toEqual({ last4: 'AbCd' })
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findProviderKeyHintForUser(db, stranger)).toBeUndefined()
    expect(await findProviderKeyForJob(db, strangerJob)).toBeUndefined()
  })

  it('reads the key of the user who owns the job', async () => {
    expect(await findProviderKeyForJob(db, ownerJob)).toEqual({
      userId: owner,
      ciphertext: 'owner-ciphertext',
      iv: 'owner-iv',
    })
  })

  it('replaces the key on a second save', async () => {
    await saveProviderKey(db, {
      userId: owner,
      ciphertext: 'new-ciphertext',
      iv: 'new-iv',
      last4: 'WxYz',
      createdAt: new Date(),
    })
    expect(await findProviderKeyForJob(db, ownerJob)).toEqual({
      userId: owner,
      ciphertext: 'new-ciphertext',
      iv: 'new-iv',
    })
  })

  it('removes the key for its owner only', async () => {
    await deleteProviderKeyForUser(db, stranger)
    expect(await findProviderKeyHintForUser(db, owner)).toBeDefined()

    await deleteProviderKeyForUser(db, owner)
    expect(await findProviderKeyForJob(db, ownerJob)).toBeUndefined()
  })
})
