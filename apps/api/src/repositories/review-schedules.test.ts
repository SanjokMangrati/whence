import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import {
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import {
  findReviewScheduleForUser,
  listDueReviewsForUser,
  listReviewSchedulesForUserJob,
  saveReviewSchedule,
} from './review-schedules'

const db = createDb(env.DB)

describe('review schedule repository', () => {
  let owner: string
  let stranger: string
  let sourceId: string
  let jobId: string
  let qaItemId: string
  let scheduleId: string

  async function schedule(qaItemId: string, dueAt: Date) {
    const id = crypto.randomUUID()
    await saveReviewSchedule(db, {
      id,
      userId: owner,
      qaItemId,
      dueAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return id
  }

  beforeEach(async () => {
    owner = await insertTestUser(db)
    stranger = await insertTestUser(db)
    sourceId = await insertTestSource(db)
    jobId = await insertTestJob(db, owner, sourceId)
    qaItemId = await insertTestQaItem(db, { userId: owner, jobId, sourceId })
    scheduleId = await schedule(qaItemId, new Date('2020-01-01'))
  })

  it('returns a review schedule to its owner', async () => {
    expect((await findReviewScheduleForUser(db, owner, qaItemId))?.id).toBe(scheduleId)
  })

  it('returns nothing for a foreign user id', async () => {
    expect(await findReviewScheduleForUser(db, stranger, qaItemId)).toBeUndefined()
    expect(await listDueReviewsForUser(db, stranger, new Date())).toEqual([])
    expect(await listReviewSchedulesForUserJob(db, stranger, jobId)).toEqual([])
  })

  it('replaces the schedule on a second save and keeps the row id', async () => {
    await saveReviewSchedule(db, {
      id: crypto.randomUUID(),
      userId: owner,
      qaItemId,
      easeFactor: 2.6,
      intervalDays: 6,
      repetitions: 2,
      dueAt: new Date('2030-01-01'),
      lastRatedAt: new Date('2029-12-26'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const row = await findReviewScheduleForUser(db, owner, qaItemId)
    expect(row).toMatchObject({
      id: scheduleId,
      intervalDays: 6,
      repetitions: 2,
      dueAt: new Date('2030-01-01'),
    })
  })

  it('returns only due questions, oldest first', async () => {
    const laterId = await insertTestQaItem(db, { userId: owner, jobId, sourceId })
    const futureId = await insertTestQaItem(db, { userId: owner, jobId, sourceId })
    await schedule(laterId, new Date('2020-06-01'))
    await schedule(futureId, new Date('2030-01-01'))

    const rows = await listDueReviewsForUser(db, owner, new Date('2025-01-01'))

    expect(rows.map((row) => row.qaItemId)).toEqual([qaItemId, laterId])
    expect(rows[0]?.question).toBe('What grows after each review?')
  })
})
