import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { findQaItemForUser, listQaItemsForUserJob, removeQaItemForUser } from './qa-items'

const db = createDb(env.DB)

describe('qa item repository', () => {
  let owner: string
  let stranger: string
  let jobId: string
  let qaItemId: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    const sourceId = await insertTestSource(db)
    jobId = await insertTestJob(db, owner, sourceId)
    qaItemId = await insertTestQaItem(db, { userId: owner, jobId, sourceId })
  })

  it('returns a question to its owner', async () => {
    expect((await findQaItemForUser(db, owner, qaItemId))?.id).toBe(qaItemId)
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findQaItemForUser(db, stranger, qaItemId)).toBeUndefined()
    expect(await listQaItemsForUserJob(db, stranger, jobId)).toEqual([])
  })

  it('does not remove a question for a foreign user id', async () => {
    expect(await removeQaItemForUser(db, stranger, qaItemId, new Date())).toBe(false)
    expect((await findQaItemForUser(db, owner, qaItemId))?.id).toBe(qaItemId)
  })

  it('hides a removed question from its owner', async () => {
    expect(await removeQaItemForUser(db, owner, qaItemId, new Date())).toBe(true)
    expect(await findQaItemForUser(db, owner, qaItemId)).toBeUndefined()
  })
})
