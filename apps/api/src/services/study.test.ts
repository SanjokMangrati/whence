import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { sm2Scheduler } from '../domain/scheduler/sm2'
import { findReviewScheduleForUser, saveReviewSchedule } from '../repositories/review-schedules'
import {
  insertTestJob,
  insertTestQaItem,
  insertTestSource,
  insertTestUser,
} from '../test/factories'
import { committedPipelineJob } from '../test/pipeline'
import {
  listDueQuestions,
  listJobQuestions,
  listMonthReviews,
  rateRecall,
  removeQuestion,
} from './study'

const db = createDb(env.DB)
const deps = { db, scheduler: sm2Scheduler }
const DAY_MS = 24 * 60 * 60 * 1000

describe('study service', () => {
  let ownerId: string
  let strangerId: string
  let sourceId: string
  let jobId: string
  let qaItemId: string

  async function scheduleAt(userId: string, id: string, dueAt: Date) {
    await saveReviewSchedule(db, {
      id: crypto.randomUUID(),
      userId,
      qaItemId: id,
      dueAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const daysFromRating = (review: { dueAt: Date; projectedDueAts: Date[] }) => {
    const ratedAt = review.dueAt.getTime() - DAY_MS
    return review.projectedDueAts.map((dueAt) => (dueAt.getTime() - ratedAt) / DAY_MS)
  }

  beforeEach(async () => {
    ownerId = await insertTestUser(db)
    strangerId = await insertTestUser(db)
    sourceId = await insertTestSource(db)
    jobId = await insertTestJob(db, ownerId, sourceId)
    qaItemId = await insertTestQaItem(db, { userId: ownerId, jobId, sourceId })
  })

  it('stores the SM-2 interval sequence across ratings', async () => {
    const intervals = []
    for (let review = 0; review < 3; review++) {
      intervals.push((await rateRecall(deps, ownerId, qaItemId, 'good'))?.intervalDays)
    }

    expect(intervals).toEqual([1, 6, 15])
    const row = await findReviewScheduleForUser(db, ownerId, qaItemId)
    expect(row?.repetitions).toBe(3)
    expect(row?.easeFactor).toBeCloseTo(2.5, 10)
    expect(row!.dueAt.getTime() - row!.lastRatedAt!.getTime()).toBe(15 * DAY_MS)
  })

  it('resets repetitions and lowers the ease factor on again', async () => {
    await rateRecall(deps, ownerId, qaItemId, 'good')
    await rateRecall(deps, ownerId, qaItemId, 'good')
    const review = await rateRecall(deps, ownerId, qaItemId, 'again')

    expect(review?.intervalDays).toBe(1)
    const row = await findReviewScheduleForUser(db, ownerId, qaItemId)
    expect(row?.repetitions).toBe(0)
    expect(row?.easeFactor).toBeCloseTo(1.7, 10)
  })

  it('projects intervals of 1, 6, 15, and 38 days at ease factor 2.5', async () => {
    const review = await rateRecall(deps, ownerId, qaItemId, 'good')

    expect(daysFromRating(review!)).toEqual([1, 7, 22, 60])
  })

  it('projects intervals of 1, 1, 6, and 10 days at ease factor 1.7 after again', async () => {
    const review = await rateRecall(deps, ownerId, qaItemId, 'again')

    expect(daysFromRating(review!)).toEqual([1, 2, 8, 18])
  })

  it('refuses a rating from another user and writes nothing', async () => {
    expect(await rateRecall(deps, strangerId, qaItemId, 'good')).toBeNull()
    expect(await findReviewScheduleForUser(db, ownerId, qaItemId)).toBeUndefined()
    expect(await findReviewScheduleForUser(db, strangerId, qaItemId)).toBeUndefined()
  })

  it('keeps a rated question out of the due list until its interval passes', async () => {
    await rateRecall(deps, ownerId, qaItemId, 'good')

    expect(await listDueQuestions(db, ownerId)).toEqual([])
  })

  it('names the source of each due question', async () => {
    await scheduleAt(ownerId, qaItemId, new Date(Date.now() - DAY_MS))

    expect(await listDueQuestions(db, ownerId)).toEqual([
      {
        id: qaItemId,
        sourceId,
        question: 'What grows after each review?',
        dueAt: expect.any(Date),
      },
    ])
    expect(await listDueQuestions(db, strangerId)).toEqual([])
  })

  it('lists the questions of a job with their next review and no answers', async () => {
    await rateRecall(deps, ownerId, qaItemId, 'good')
    const schedule = await findReviewScheduleForUser(db, ownerId, qaItemId)

    expect(await listJobQuestions(db, ownerId, jobId)).toEqual([
      {
        id: qaItemId,
        question: 'What grows after each review?',
        spanIds: [],
        dueAt: schedule?.dueAt,
      },
    ])
    expect(await listJobQuestions(db, strangerId, jobId)).toBeNull()
  })

  it('lists the spans each question cites', async () => {
    const job = await committedPipelineJob(ownerId)

    expect(await listJobQuestions(db, ownerId, job.jobId)).toMatchObject([
      { id: job.qaItemIds[0], spanIds: [job.spanIds[1]] },
    ])
  })

  it('lists the reviews of October from September 30 to November 1, and every open review', async () => {
    const now = new Date('2026-09-01T12:00:00Z')
    for (const dueAt of [
      '2026-08-02T10:00:00Z',
      '2026-09-29T23:00:00Z',
      '2026-09-30T00:00:00Z',
      '2026-10-20T09:00:00Z',
      '2026-11-01T23:59:00Z',
      '2026-11-02T00:00:00Z',
    ]) {
      const id = await insertTestQaItem(db, { userId: ownerId, jobId, sourceId })
      await scheduleAt(ownerId, id, new Date(dueAt))
    }
    const foreignJobId = await insertTestJob(db, strangerId, sourceId)
    const foreignItemId = await insertTestQaItem(db, {
      userId: strangerId,
      jobId: foreignJobId,
      sourceId,
    })
    await scheduleAt(strangerId, foreignItemId, new Date('2026-10-20T12:00:00Z'))

    const reviews = await listMonthReviews(db, ownerId, { year: 2026, month: 10 }, now)

    expect(reviews.map((review) => [review.jobId, review.dueAt.toISOString()])).toEqual([
      [jobId, '2026-08-02T10:00:00.000Z'],
      [jobId, '2026-09-30T00:00:00.000Z'],
      [jobId, '2026-10-20T09:00:00.000Z'],
      [jobId, '2026-11-01T23:59:00.000Z'],
    ])
  })

  it('removes a question and its schedule for its owner only', async () => {
    await rateRecall(deps, ownerId, qaItemId, 'good')

    expect(await removeQuestion(db, strangerId, qaItemId)).toBe(false)
    expect(await removeQuestion(db, ownerId, qaItemId)).toBe(true)
    expect(await listJobQuestions(db, ownerId, jobId)).toEqual([])
    expect(await findReviewScheduleForUser(db, ownerId, qaItemId)).toBeUndefined()
  })
})
