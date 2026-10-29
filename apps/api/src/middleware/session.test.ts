import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { signUp } from '../test/session'

describe('session middleware', () => {
  it('rejects a request with no session', async () => {
    const res = await SELF.fetch('https://example.com/api/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('answers an unknown path with the not_found code', async () => {
    const { cookie } = await signUp()

    const res = await SELF.fetch('https://example.com/api/nothing-here', { headers: { cookie } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('resolves the signed-in user on a protected route', async () => {
    const { cookie, userId } = await signUp()

    const meRes = await SELF.fetch('https://example.com/api/me', {
      headers: { cookie },
    })
    expect(meRes.status).toBe(200)
    expect(await meRes.json<{ id: string }>()).toMatchObject({ id: userId })
  })
})
