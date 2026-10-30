import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { createDb } from '../db/client'
import { sm2Scheduler } from '../domain/scheduler/sm2'
import type { RecallRating } from '../domain/types'
import type { AppEnv } from '../middleware/session'
import { readQaItem } from '../services/artifact-reader'
import { readReminders, setReminders } from '../services/reminders'
import {
  listDueQuestions,
  listJobQuestions,
  listMonthReviews,
  rateRecall,
  removeQuestion,
} from '../services/study'
import { refusalResponse, requestError } from './errors'

const RECALL_RATINGS: readonly RecallRating[] = ['again', 'hard', 'good', 'easy']

const monthQuery = validator(
  'query',
  (query, c) => parseMonth(query) ?? requestError(c, 'invalid_request'),
)

const remindersBody = validator(
  'json',
  (body, c) => parseReminders(body) ?? requestError(c, 'invalid_request'),
)

const ratingBody = validator(
  'json',
  (body, c) => parseRating(body) ?? requestError(c, 'invalid_request'),
)

export const study = new Hono<AppEnv>()
  .get('/jobs/:jobId/questions', async (c) => {
    const items = await listJobQuestions(createDb(c.env.DB), c.get('user').id, c.req.param('jobId'))
    return items === null ? requestError(c, 'not_found') : c.json({ items })
  })
  .get('/due', async (c) => {
    return c.json({ items: await listDueQuestions(createDb(c.env.DB), c.get('user').id) })
  })
  .get('/calendar', monthQuery, async (c) => {
    const reviews = await listMonthReviews(
      createDb(c.env.DB),
      c.get('user').id,
      c.req.valid('query').month,
      new Date(),
    )
    return c.json({ reviews })
  })
  .get('/reminders', async (c) => {
    return c.json(await readReminders(createDb(c.env.DB), c.get('user').id))
  })
  .put('/reminders', remindersBody, async (c) => {
    const { enabled } = c.req.valid('json')
    try {
      return c.json(await setReminders(createDb(c.env.DB), c.get('user').id, enabled, new Date()))
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .get('/questions/:id/answer', async (c) => {
    const item = await readQaItem(
      { db: createDb(c.env.DB), bucket: c.env.BUCKET },
      c.get('user').id,
      c.req.param('id'),
    )
    return item === null ? requestError(c, 'not_found') : c.json(item)
  })
  .delete('/questions/:id', async (c) => {
    const found = await removeQuestion(createDb(c.env.DB), c.get('user').id, c.req.param('id'))
    return found ? c.body(null, 204) : requestError(c, 'not_found')
  })
  .post('/questions/:id/rating', ratingBody, async (c) => {
    const review = await rateRecall(
      { db: createDb(c.env.DB), scheduler: sm2Scheduler },
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').rating,
    )
    return review === null ? requestError(c, 'not_found') : c.json(review)
  })

function parseMonth(query: Record<string, string | string[]>) {
  const match = typeof query.month === 'string' ? /^(\d{4})-(\d{2})$/.exec(query.month) : null
  if (match === null) return null
  const [year, month] = [Number(match[1]), Number(match[2])]
  return month >= 1 && month <= 12 ? { month: { year, month } } : null
}

function parseReminders(body: unknown): { enabled: boolean } | null {
  if (typeof body !== 'object' || body === null) return null
  const { enabled } = body as Record<string, unknown>
  return typeof enabled === 'boolean' ? { enabled } : null
}

function parseRating(body: unknown): { rating: RecallRating } | null {
  if (typeof body !== 'object' || body === null) return null
  const { rating } = body as Record<string, unknown>
  return RECALL_RATINGS.includes(rating as RecallRating) ? { rating: rating as RecallRating } : null
}
