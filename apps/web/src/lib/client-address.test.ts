import { describe, expect, it } from 'vitest'
import { withClientAddress } from './client-address'

describe('withClientAddress', () => {
  it('sets the address from the edge over a browser value', () => {
    const headers = withClientAddress(
      new Headers({ 'cf-connecting-ip': '203.0.113.5', 'x-client-ip': '198.51.100.1' }),
    )
    expect(headers.get('x-client-ip')).toBe('203.0.113.5')
  })

  it('removes a browser value when the edge gives no address', () => {
    const headers = withClientAddress(new Headers({ 'x-client-ip': '198.51.100.1' }))
    expect(headers.has('x-client-ip')).toBe(false)
  })
})
