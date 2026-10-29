import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { assertPublicHost, fetchPublicUrl } from './public-address'

const NO_DEADLINE = new AbortController().signal

function dnsAnswer(address: string, type: number) {
  return Response.json({ Answer: [{ type, data: address }] })
}

describe('public address guard', () => {
  it('refuses a host name that resolves to a private address', async () => {
    const requests = stubFetch(() => dnsAnswer('127.0.0.1', 1))

    await expect(assertPublicHost('internal.example.com')).rejects.toMatchObject({
      code: 'private_address',
    })
    expect(requests.map((request) => request.url)).toEqual([
      'https://cloudflare-dns.com/dns-query?name=internal.example.com&type=A',
      'https://cloudflare-dns.com/dns-query?name=internal.example.com&type=AAAA',
    ])
  })

  it('refuses a private IPv6 answer', async () => {
    stubFetch((request) =>
      request.url.endsWith('type=AAAA') ? dnsAnswer('fd00::1', 28) : Response.json({}),
    )

    await expect(assertPublicHost('internal.example.com')).rejects.toMatchObject({
      code: 'private_address',
    })
  })

  it('refuses a host name with no address', async () => {
    stubFetch(() => Response.json({}))

    await expect(assertPublicHost('missing.example.com')).rejects.toMatchObject({
      code: 'private_address',
    })
  })

  it('refuses when the resolver fails', async () => {
    stubFetch(() => new Response('', { status: 503 }))

    await expect(assertPublicHost('example.com')).rejects.toMatchObject({
      code: 'private_address',
    })
  })

  it('refuses an address literal without asking the resolver', async () => {
    const requests = stubFetch(() => dnsAnswer('1.1.1.1', 1))

    await expect(assertPublicHost('169.254.169.254')).rejects.toMatchObject({
      code: 'private_address',
    })
    await expect(assertPublicHost('[::1]')).rejects.toMatchObject({ code: 'private_address' })
    expect(requests).toHaveLength(0)
  })

  it('checks every redirect hop and stops before fetching a private one', async () => {
    const requests = stubFetch((request) => {
      if (request.url.startsWith('https://cloudflare-dns.com')) {
        return dnsAnswer('93.184.216.34', 1)
      }
      if (request.url === 'https://example.com/post') {
        return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
      }
      return new Response('reached')
    })

    await expect(fetchPublicUrl('https://example.com/post', NO_DEADLINE)).rejects.toMatchObject({
      code: 'private_address',
    })
    expect(requests.map((request) => request.url)).not.toContain('http://127.0.0.1/admin')
  })

  it('refuses a redirect to another scheme', async () => {
    stubFetch((request) => {
      if (request.url.startsWith('https://cloudflare-dns.com')) {
        return dnsAnswer('93.184.216.34', 1)
      }
      return new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } })
    })

    await expect(fetchPublicUrl('https://example.com/post', NO_DEADLINE)).rejects.toMatchObject({
      code: 'private_address',
    })
  })

  it('stops after five redirects', async () => {
    let hop = 0
    stubFetch((request) => {
      if (request.url.startsWith('https://cloudflare-dns.com')) {
        return dnsAnswer('93.184.216.34', 1)
      }
      hop += 1
      return new Response(null, { status: 301, headers: { location: `/hop-${hop}` } })
    })

    await expect(fetchPublicUrl('https://example.com/post', NO_DEADLINE)).rejects.toMatchObject({
      code: 'extraction_failed',
    })
    expect(hop).toBe(6)
  })

  it('passes the signal to the page request', async () => {
    const controller = new AbortController()
    stubFetch((request) => {
      if (request.url.startsWith('https://cloudflare-dns.com')) {
        return dnsAnswer('93.184.216.34', 1)
      }
      return new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason))
        controller.abort(new DOMException('The page is slow.', 'TimeoutError'))
      })
    })

    await expect(
      fetchPublicUrl('https://example.com/post', controller.signal),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('returns the response when every hop is public', async () => {
    stubFetch((request) => {
      if (request.url.startsWith('https://cloudflare-dns.com')) {
        return dnsAnswer('93.184.216.34', 1)
      }
      if (request.url === 'https://example.com/post') {
        return new Response(null, { status: 301, headers: { location: '/post/final' } })
      }
      return new Response('reached')
    })

    const response = await fetchPublicUrl('https://example.com/post', NO_DEADLINE)
    expect(await response.text()).toBe('reached')
  })
})
