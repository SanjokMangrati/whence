import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { createDb } from '../db/client'
import type { OutputType } from '../domain/types'
import { rateLimit, signedInUser } from '../middleware/rate-limit'
import type { AppEnv } from '../middleware/session'
import { readJobSource } from '../services/artifact-reader'
import { startGeneration } from '../services/generation-request'
import { deleteGeneration, listGenerations, readGenerationStatus } from '../services/generations'
import { refusalResponse, requestError } from './errors'

const OUTPUT_TYPES: readonly OutputType[] = ['notes', 'cheat_sheet', 'notes_and_cheat_sheet']

const MAX_URL_LENGTH = 2048

const startBody = validator(
  'json',
  (body, c) => parseRequest(body) ?? requestError(c, 'invalid_request'),
)

export const generations = new Hono<AppEnv>()
  .post('/', rateLimit('GENERATION_LIMITER', signedInUser), startBody, async (c) => {
    try {
      const started = await startGeneration(
        {
          db: createDb(c.env.DB),
          workflow: c.env.GENERATION_WORKFLOW,
          dailySourceLimit: c.env.DAILY_SOURCE_LIMIT,
          userKeyRequired: c.env.ANTHROPIC_API_KEY === undefined,
        },
        { userId: c.get('user').id, ...c.req.valid('json') },
      )
      return c.json(started, 202)
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .get('/', async (c) => {
    return c.json({ items: await listGenerations(createDb(c.env.DB), c.get('user').id) })
  })
  .get('/:id', async (c) => {
    const status = await readGenerationStatus(
      createDb(c.env.DB),
      c.get('user').id,
      c.req.param('id'),
      c.env.ANTHROPIC_API_KEY === undefined,
    )
    return status === null ? requestError(c, 'not_found') : c.json(status)
  })
  .delete('/:id', async (c) => {
    const found = await deleteGeneration(createDb(c.env.DB), c.get('user').id, c.req.param('id'))
    return found ? c.body(null, 204) : requestError(c, 'not_found')
  })
  .get('/:id/source', async (c) => {
    const view = await readJobSource(
      { db: createDb(c.env.DB), bucket: c.env.BUCKET },
      c.get('user').id,
      c.req.param('id'),
    )
    return view === null ? requestError(c, 'not_found') : c.json(view)
  })

function parseRequest(body: unknown): { url: string; outputType: OutputType } | null {
  if (typeof body !== 'object' || body === null) return null
  const { url, outputType } = body as Record<string, unknown>
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return null
  if (!OUTPUT_TYPES.includes(outputType as OutputType)) return null
  return { url, outputType: outputType as OutputType }
}
