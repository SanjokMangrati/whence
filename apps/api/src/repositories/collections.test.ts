import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestUser } from '../test/factories'
import {
  deleteCollectionForUser,
  findCollectionForUser,
  insertCollection,
  listCollectionsForUser,
  renameCollectionForUser,
} from './collections'

const db = createDb(env.DB)

describe('collection repository', () => {
  let owner: string
  let stranger: string
  let collectionId: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    collectionId = crypto.randomUUID()
    await insertCollection(db, {
      id: collectionId,
      userId: owner,
      name: 'Biology',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('returns a collection to its owner', async () => {
    expect((await findCollectionForUser(db, owner, collectionId))?.id).toBe(collectionId)
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findCollectionForUser(db, stranger, collectionId)).toBeUndefined()
    expect(await listCollectionsForUser(db, stranger)).toEqual([])
  })

  it('does not rename a collection for a foreign user id', async () => {
    await renameCollectionForUser(db, stranger, collectionId, 'Taken', new Date())
    expect((await findCollectionForUser(db, owner, collectionId))?.name).toBe('Biology')
  })

  it('does not delete a collection for a foreign user id', async () => {
    await deleteCollectionForUser(db, stranger, collectionId)
    expect((await findCollectionForUser(db, owner, collectionId))?.id).toBe(collectionId)
  })
})
