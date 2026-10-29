import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { signUp } from '../test/session'

const KEY = 'sk-ant-api03-visitor-key-for-tests-only-AbCd'

function call(cookie: string, method: string, body?: object) {
  return SELF.fetch('https://example.com/api/me/provider-key', {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('provider key routes', () => {
  it('saves a key and answers with its last four characters only', async () => {
    const { cookie } = await signUp()

    const saved = await call(cookie, 'PUT', { key: KEY })
    const savedText = await saved.text()
    const readText = await (await call(cookie, 'GET')).text()

    expect(saved.status).toBe(200)
    expect(JSON.parse(savedText)).toEqual({ set: true, last4: 'AbCd' })
    expect(JSON.parse(readText)).toEqual({ set: true, last4: 'AbCd' })
    expect(savedText + readText).not.toContain('visitor-key')
  })

  it('shows no key to another user', async () => {
    const owner = await signUp()
    const stranger = await signUp()
    await call(owner.cookie, 'PUT', { key: KEY })

    expect(await (await call(stranger.cookie, 'GET')).json()).toEqual({ set: false, last4: null })
  })

  it('refuses a value that is not an Anthropic key', async () => {
    const { cookie } = await signUp()

    for (const body of [{ key: 'sk-proj-openai-key-for-tests-only-123456' }, { key: 42 }, {}]) {
      const response = await call(cookie, 'PUT', body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
    expect(await (await call(cookie, 'GET')).json()).toEqual({ set: false, last4: null })
  })

  it('deletes the key', async () => {
    const { cookie } = await signUp()
    await call(cookie, 'PUT', { key: KEY })

    expect((await call(cookie, 'DELETE')).status).toBe(204)
    expect(await (await call(cookie, 'GET')).json()).toEqual({ set: false, last4: null })
  })

  it('refuses a request without a session', async () => {
    const response = await SELF.fetch('https://example.com/api/me/provider-key')
    expect(response.status).toBe(401)
  })
})
