import { Hono } from 'hono'
import { createDb } from '../db/client'
import type { AppEnv } from '../middleware/session'
import { readArtifact } from '../services/artifact-reader'
import { exportArtifact, type ExportFormat } from '../services/export'
import { attachment } from './attachment'
import { refusalResponse, requestError } from './errors'

export const artifacts = new Hono<AppEnv>()
  .get('/:id', async (c) => {
    const view = await readArtifact(
      { db: createDb(c.env.DB), bucket: c.env.BUCKET },
      c.get('user').id,
      c.req.param('id'),
    )
    return view === null ? requestError(c, 'not_found') : c.json(view)
  })
  .get('/:id/export/:format{pdf|docx|md}', async (c) => {
    try {
      const file = await exportArtifact(
        { db: createDb(c.env.DB), bucket: c.env.BUCKET },
        c.get('user').id,
        c.req.param('id'),
        c.req.param('format') as ExportFormat,
      )
      if (file === null) return requestError(c, 'not_found')
      return c.body(file.bytes, 200, {
        'content-type': file.contentType,
        'content-disposition': attachment(file.filename),
      })
    } catch (error) {
      return refusalResponse(c, error)
    }
  })
