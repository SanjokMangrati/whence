import { createExecutionContext, SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../index'
import { stubFetch } from '../test/fetch'
import { signUp } from '../test/session'

const KEY = 'sk-ant-api03-visitor-key-for-tests-only-AbCd'
const ANTHROPIC = 'https://api.anthropic.com/'

function call(cookie: string, method: string, body?: object) {
  return SELF.fetch('https://example.com/api/me/provider-key', {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('provider key routes', () => {
  let anthropicRequests: Request[]

  beforeEach(() => {
    anthropicRequests = stubFetch(() => Response.json({ data: [], has_more: false }))
  })

  it('saves a key and answers with its last four characters only', async () => {
    const { cookie } = await signUp()

    const saved = await call(cookie, 'PUT', { key: KEY })
    const savedText = await saved.text()
    const readText = await (await call(cookie, 'GET')).text()

    expect(saved.status).toBe(200)
    expect(JSON.parse(savedText)).toEqual({ set: true, last4: 'AbCd' })
    expect(JSON.parse(readText)).toEqual({ set: true, last4: 'AbCd', required: true })
    expect(savedText + readText).not.toContain('visitor-key')
    const checks = anthropicRequests.filter((request) => request.url.startsWith(ANTHROPIC))
    expect(checks.map((request) => request.headers.get('authorization'))).toEqual([`Bearer ${KEY}`])
  })

  it('refuses a key that Anthropic rejects', async () => {
    const { cookie } = await signUp()
    stubFetch(() =>
      Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status: 401 },
      ),
    )

    const response = await call(cookie, 'PUT', { key: KEY })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'provider_key_rejected' })
    expect(await (await call(cookie, 'GET')).json()).toMatchObject({ set: false })
  })

  it('shows no key to another user', async () => {
    const owner = await signUp()
    const stranger = await signUp()
    await call(owner.cookie, 'PUT', { key: KEY })

    expect(await (await call(stranger.cookie, 'GET')).json()).toEqual({
      set: false,
      last4: null,
      required: true,
    })
  })

  it('refuses a value that is not an Anthropic key', async () => {
    const { cookie } = await signUp()

    for (const body of [{ key: 'sk-proj-openai-key-for-tests-only-123456' }, { key: 42 }, {}]) {
      const response = await call(cookie, 'PUT', body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
    expect(await (await call(cookie, 'GET')).json()).toEqual({
      set: false,
      last4: null,
      required: true,
    })
  })

  it('deletes the key', async () => {
    const { cookie } = await signUp()
    await call(cookie, 'PUT', { key: KEY })

    expect((await call(cookie, 'DELETE')).status).toBe(204)
    expect(await (await call(cookie, 'GET')).json()).toEqual({
      set: false,
      last4: null,
      required: true,
    })
  })

  it('needs no user key where the deployment has its own key', async () => {
    const { cookie } = await signUp()

    const response = await worker.fetch(
      new Request('https://example.com/api/me/provider-key', { headers: { cookie } }),
      { ...env, ANTHROPIC_API_KEY: 'sk-ant-server-key-for-tests-only' },
      createExecutionContext(),
    )

    expect(await response.json()).toEqual({ set: false, last4: null, required: false })
  })

  it('refuses a request without a session', async () => {
    const response = await SELF.fetch('https://example.com/api/me/provider-key')
    expect(response.status).toBe(401)
  })
})
