import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { insertTestJob, insertTestSource, insertTestUser } from '../test/factories'
import { deleteGenerationJobForUser } from './generation-delete'
import { findGenerationJobForUser, listGenerationJobsForUser } from './generation-jobs'

const db = createDb(env.DB)

describe('generation job repository', () => {
  let owner: string
  let stranger: string
  let sourceId: string
  let jobId: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    sourceId = await insertTestSource(db)
    jobId = await insertTestJob(db, owner, sourceId)
  })

  it('returns a job to its owner', async () => {
    expect((await findGenerationJobForUser(db, owner, jobId))?.id).toBe(jobId)
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findGenerationJobForUser(db, stranger, jobId)).toBeUndefined()
  })

  it('returns nothing for a deleted job', async () => {
    await deleteGenerationJobForUser(db, owner, jobId, new Date())
    expect(await findGenerationJobForUser(db, owner, jobId)).toBeUndefined()
  })

  it('lists only the jobs a user owns, newest first', async () => {
    const newerId = await insertTestJob(db, owner, sourceId, new Date(Date.now() + 60_000))

    const rows = await listGenerationJobsForUser(db, owner)
    expect(rows.map((row) => row.id)).toEqual([newerId, jobId])
    expect(await listGenerationJobsForUser(db, stranger)).toEqual([])
  })
})
