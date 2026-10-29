import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { findReviewScheduleForUser } from '../repositories/review-schedules'
import { committedPipelineJob } from '../test/pipeline'
import { signUp } from '../test/session'

const db = createDb(env.DB)

function call(cookie: string, path: string, init: { method?: string; body?: unknown } = {}) {
  return SELF.fetch(`https://example.com/api/study${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

describe('study routes', () => {
  let owner: Awaited<ReturnType<typeof signUp>>
  let stranger: Awaited<ReturnType<typeof signUp>>
  let job: Awaited<ReturnType<typeof committedPipelineJob>>
  let qaItemId: string

  beforeEach(async () => {
    owner = await signUp()
    stranger = await signUp()
    job = await committedPipelineJob(owner.userId)
    qaItemId = job.qaItemIds[0]!
  })

  it('runs a question, reveal, and rating cycle', async () => {
    const questions = await call(owner.cookie, `/jobs/${job.jobId}/questions`)
    expect(await questions.json()).toEqual({
      items: [
        {
          id: qaItemId,
          question: 'What happens to the interval after a successful review?',
          spanIds: [job.spanIds[1]],
          dueAt: null,
        },
      ],
    })

    const revealed = await call(owner.cookie, `/questions/${qaItemId}/answer`)
    expect(await revealed.json()).toMatchObject({
      answer: 'The interval grows after each successful review.',
      citations: [{ text: 'The interval grows after each successful review.' }],
    })

    const rated = await call(owner.cookie, `/questions/${qaItemId}/rating`, {
      method: 'POST',
      body: { rating: 'good' },
    })
    expect(rated.status).toBe(200)
    expect(await rated.json()).toMatchObject({ qaItemId, intervalDays: 1 })
    expect((await findReviewScheduleForUser(db, owner.userId, qaItemId))?.repetitions).toBe(1)
  })

  it('hides the questions, answers, and ratings of one user from another', async () => {
    const rating = { method: 'POST', body: { rating: 'good' } }

    expect((await call(stranger.cookie, `/jobs/${job.jobId}/questions`)).status).toBe(404)
    expect((await call(stranger.cookie, `/questions/${qaItemId}/answer`)).status).toBe(404)
    expect((await call(stranger.cookie, `/questions/${qaItemId}/rating`, rating)).status).toBe(404)
    expect(
      (await call(stranger.cookie, `/questions/${qaItemId}`, { method: 'DELETE' })).status,
    ).toBe(404)
    expect(await findReviewScheduleForUser(db, stranger.userId, qaItemId)).toBeUndefined()
  })

  it('refuses a rating that is not one of the four', async () => {
    const response = await call(owner.cookie, `/questions/${qaItemId}/rating`, {
      method: 'POST',
      body: { rating: 'perfect' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_request' })
  })

  it('removes a question from its job', async () => {
    expect((await call(owner.cookie, `/questions/${qaItemId}`, { method: 'DELETE' })).status).toBe(
      204,
    )
    expect(await (await call(owner.cookie, `/jobs/${job.jobId}/questions`)).json()).toEqual({
      items: [],
    })
  })

  it('refuses a calendar month that is not a month', async () => {
    for (const month of ['2026-13', '2026-1', 'october']) {
      expect((await call(owner.cookie, `/calendar?month=${month}`)).status).toBe(400)
    }
    expect((await call(owner.cookie, '/calendar?month=2026-10')).status).toBe(200)
  })

  it('turns reminders on for the user only', async () => {
    const saved = await call(owner.cookie, '/reminders', { method: 'PUT', body: { enabled: true } })

    expect(await saved.json()).toEqual({ enabled: true })
    expect(await (await call(owner.cookie, '/reminders')).json()).toEqual({ enabled: true })
    expect(await (await call(stranger.cookie, '/reminders')).json()).toEqual({ enabled: false })
    expect(
      (await call(owner.cookie, '/reminders', { method: 'PUT', body: { enabled: 'yes' } })).status,
    ).toBe(400)
  })
})
