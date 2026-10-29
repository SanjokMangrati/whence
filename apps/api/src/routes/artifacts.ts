import { Hono } from 'hono'
import { createDb } from '../db/client'
import type { AppEnv } from '../middleware/session'
import { readArtifact } from '../services/artifact-reader'
import { requestError } from './errors'

export const artifacts = new Hono<AppEnv>().get('/:id', async (c) => {
  const view = await readArtifact(
    { db: createDb(c.env.DB), bucket: c.env.BUCKET },
    c.get('user').id,
    c.req.param('id'),
  )
  return view === null ? requestError(c, 'not_found') : c.json(view)
})
