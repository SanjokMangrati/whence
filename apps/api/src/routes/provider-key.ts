import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { createDb } from '../db/client'
import type { AppEnv } from '../middleware/session'
import { providerKeyStatus, removeProviderKey, storeProviderKey } from '../services/provider-keys'
import { requestError } from './errors'

const ANTHROPIC_KEY = /^sk-ant-[\w-]{20,200}$/

const keyBody = validator('json', (body, c) => {
  const key = parseKey(body)
  return key === null ? requestError(c, 'invalid_request') : { key }
})

export const providerKey = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await providerKeyStatus(createDb(c.env.DB), c.get('user').id)))
  .put('/', keyBody, async (c) => {
    const status = await storeProviderKey(
      createDb(c.env.DB),
      c.env.KEY_ENCRYPTION_SECRET,
      c.get('user').id,
      c.req.valid('json').key,
    )
    return c.json(status)
  })
  .delete('/', async (c) => {
    await removeProviderKey(createDb(c.env.DB), c.get('user').id)
    return c.body(null, 204)
  })

function parseKey(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const { key } = body as Record<string, unknown>
  return typeof key === 'string' && ANTHROPIC_KEY.test(key) ? key : null
}
