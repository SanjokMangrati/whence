import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequestErrorReporter } from './server-errors'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function recordFetch(response: () => Response) {
  const calls: Request[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init))
    return response()
  }) as typeof fetch
  return calls
}

async function eventsOf(request: Request) {
  const body = Buffer.from(await request.arrayBuffer())
  const gzipped = request.headers.get('content-encoding') === 'gzip'
  const parsed = JSON.parse((gzipped ? gunzipSync(body) : body).toString())
  return (parsed.batch ?? [parsed]) as {
    event: string
    distinct_id: string
    properties: Record<string, unknown>
  }[]
}

const config = { apiKey: 'phc_test', host: 'https://posthog.example.test' }

const context = {
  routerKind: 'App Router',
  routePath: '/(auth)/reset-password',
  routeType: 'render',
  renderSource: 'server-rendering',
  revalidateReason: undefined,
} as const

describe('request error reporter', () => {
  it('sends the route and the browser visitor id, not the path or the URL in the error', async () => {
    const calls = recordFetch(() => Response.json({ status: 1 }))
    const visitor = encodeURIComponent(JSON.stringify({ distinct_id: 'user-1' }))
    const host = ['site', 'test'].join('.')
    const email = ['me@mail', 'test'].join('.')
    const token = ['reset', 'token'].join('-')
    const url = `https://${host}/a`
    const error = Object.assign(new Error(`Fetch to ${url} failed for ${email}`), {
      digest: '123',
    })

    await createRequestErrorReporter(config)(
      error,
      {
        path: `/reset-password?token=${token}`,
        method: 'GET',
        headers: { cookie: `theme=dark; ph_phc_test_posthog=${visitor}` },
      },
      context,
    )

    expect(calls).toHaveLength(1)
    const [event] = await eventsOf(calls[0]!)
    expect(event!.event).toBe('$exception')
    expect(event!.distinct_id).toBe('user-1')
    expect(event!.properties.where).toBe('web/render')
    expect(event!.properties.route).toBe('/(auth)/reset-password')
    expect(event!.properties.digest).toBe('123')
    const exceptions = event!.properties.$exception_list as { value: string }[]
    expect(exceptions[0]!.value).toBe('Fetch to [url] failed for [email]')
    const sent = JSON.stringify(event)
    for (const value of [host, email, token]) expect(sent).not.toContain(value)
  })

  it('still sends when the visitor cookie is not valid JSON', async () => {
    const calls = recordFetch(() => Response.json({ status: 1 }))

    await createRequestErrorReporter(config)(
      new Error('boom'),
      { path: '/', method: 'GET', headers: { cookie: 'ph_phc_test_posthog=%7Bnot' } },
      context,
    )

    expect(calls).toHaveLength(1)
  })

  it('does not throw when PostHog is down', async () => {
    recordFetch(() => new Response('', { status: 503 }))

    await expect(
      createRequestErrorReporter(config)(
        new Error('boom'),
        { path: '/', method: 'GET', headers: {} },
        context,
      ),
    ).resolves.toBeUndefined()
  })

  it('sends nothing without a key or a host', async () => {
    const calls = recordFetch(() => Response.json({ status: 1 }))

    for (const partial of [
      { ...config, apiKey: '' },
      { ...config, host: '' },
    ]) {
      await createRequestErrorReporter(partial)(
        new Error('boom'),
        { path: '/', method: 'GET', headers: {} },
        context,
      )
    }

    expect(calls).toHaveLength(0)
  })
})
