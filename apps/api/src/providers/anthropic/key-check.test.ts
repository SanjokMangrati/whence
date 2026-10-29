import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { anthropicKeyWorks } from './key-check'

const UNAUTHORIZED = {
  type: 'error',
  error: { type: 'authentication_error', message: 'invalid x-api-key' },
}

describe('anthropic key check', () => {
  it('lists one model with the key', async () => {
    const requests = stubFetch(() => Response.json({ data: [], has_more: false }))

    expect(await anthropicKeyWorks('sk-ant-test')).toBe(true)
    expect(requests[0]!.url).toBe('https://api.anthropic.com/v1/models?limit=1')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer sk-ant-test')
  })

  it('answers false when Anthropic rejects the key', async () => {
    stubFetch(() => Response.json(UNAUTHORIZED, { status: 401 }))

    expect(await anthropicKeyWorks('sk-ant-revoked')).toBe(false)
  })

  it('throws when Anthropic fails for another reason', async () => {
    stubFetch(() =>
      Response.json({ type: 'error', error: { type: 'invalid_request_error' } }, { status: 400 }),
    )

    await expect(anthropicKeyWorks('sk-ant-test')).rejects.toThrow()
  })
})
