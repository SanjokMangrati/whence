import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { createDb } from '../db/client'
import type { AppEnv } from '../middleware/session'
import {
  addSourceToCollection,
  createCollection,
  deleteCollection,
  listCollections,
  removeSourceFromCollection,
  renameCollection,
} from '../services/collections'
import { refusalResponse, requestError } from './errors'

const MAX_NAME_LENGTH = 80

const nameBody = validator('json', (body, c) => {
  const name = parseName(body)
  return name === null ? requestError(c, 'invalid_request') : { name }
})

export const collections = new Hono<AppEnv>()
  .get('/', async (c) => {
    const items = await listCollections(createDb(c.env.DB), c.get('user').id)
    return c.json({ items })
  })
  .post('/', nameBody, async (c) => {
    try {
      const created = await createCollection(
        createDb(c.env.DB),
        c.get('user').id,
        c.req.valid('json').name,
      )
      return c.json(created, 201)
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .patch('/:id', nameBody, async (c) => {
    try {
      const found = await renameCollection(
        createDb(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        c.req.valid('json').name,
      )
      return found ? c.body(null, 204) : requestError(c, 'not_found')
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .delete('/:id', async (c) => {
    try {
      const found = await deleteCollection(createDb(c.env.DB), c.get('user').id, c.req.param('id'))
      return found ? c.body(null, 204) : requestError(c, 'not_found')
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .put('/:id/sources/:jobId', async (c) => {
    try {
      const found = await addSourceToCollection(
        createDb(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        c.req.param('jobId'),
      )
      return found ? c.body(null, 204) : requestError(c, 'not_found')
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
  .delete('/:id/sources/:jobId', async (c) => {
    try {
      const found = await removeSourceFromCollection(
        createDb(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        c.req.param('jobId'),
      )
      return found ? c.body(null, 204) : requestError(c, 'not_found')
    } catch (error) {
      return refusalResponse(c, error)
    }
  })

function parseName(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const { name } = body as Record<string, unknown>
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH ? null : trimmed
}
