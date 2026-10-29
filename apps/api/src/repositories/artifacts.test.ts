import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  insertTestArtifact,
  insertTestJob,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { findArtifactForUser, listArtifactsByJob, listArtifactsForUserJob } from './artifacts'
import { deleteGenerationJobForUser } from './generation-delete'

const db = createDb(env.DB)

describe('artifact repository', () => {
  let owner: string
  let stranger: string
  let jobId: string
  let artifactId: string

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    const sourceId = await insertTestSource(db)
    jobId = await insertTestJob(db, owner, sourceId)
    artifactId = await insertTestArtifact(db, { userId: owner, jobId, sourceId })
  })

  it('returns an artifact to its owner', async () => {
    expect((await findArtifactForUser(db, owner, artifactId))?.id).toBe(artifactId)
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findArtifactForUser(db, stranger, artifactId)).toBeUndefined()
    expect(await listArtifactsForUserJob(db, stranger, jobId)).toEqual([])
  })

  it('hides the artifacts of a deleted job and keeps them for the cache', async () => {
    await deleteGenerationJobForUser(db, owner, jobId, new Date())

    expect(await findArtifactForUser(db, owner, artifactId)).toBeUndefined()
    expect(await listArtifactsForUserJob(db, owner, jobId)).toEqual([])
    expect((await listArtifactsByJob(db, jobId)).map((row) => row.id)).toEqual([artifactId])
  })
})
