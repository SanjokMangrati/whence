import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { createPostHogErrorReporter } from './error-reporter'

async function eventsOf(request: Request) {
  let body: ReadableStream<Uint8Array> = request.body!
  if (request.headers.get('content-encoding') === 'gzip') {
    body = body.pipeThrough(new DecompressionStream('gzip'))
  }
  const parsed = JSON.parse(await new Response(body).text())
  return (parsed.batch ?? [parsed]) as {
    event: string
    distinct_id: string
    properties: Record<string, unknown>
  }[]
}

describe('posthog error reporter', () => {
  it('sends the error without the URL or email it holds', async () => {
    const calls = stubFetch(() => Response.json({ status: 1 }))
    const reporter = createPostHogErrorReporter({
      apiKey: 'phc_test',
      host: 'https://posthog.example.test',
    })

    await reporter.report(
      new Error('No article content was found at https://site.test/a?b=1 for me@mail.test.'),
      { where: 'generation/extract', userId: 'user-1', properties: { code: 'extraction_failed' } },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url.startsWith('https://posthog.example.test/')).toBe(true)
    const [event] = await eventsOf(calls[0]!)
    expect(event!.event).toBe('$exception')
    expect(event!.distinct_id).toBe('user-1')
    expect(event!.properties.where).toBe('generation/extract')
    expect(event!.properties.code).toBe('extraction_failed')
    const sent = JSON.stringify(event)
    expect(sent).toContain('No article content was found at [url] for [email].')
    expect(sent).not.toContain('site.test')
    expect(sent).not.toContain('me@mail.test')
  })

  it('does not throw when PostHog is down', async () => {
    stubFetch(() => new Response('', { status: 503 }))
    const reporter = createPostHogErrorReporter({
      apiKey: 'phc_test',
      host: 'https://posthog.example.test',
    })

    await expect(reporter.report(new Error('boom'), { where: 'test' })).resolves.toBeUndefined()
  })

  it('sends nothing without a key', async () => {
    const calls = stubFetch(() => Response.json({ status: 1 }))
    const reporter = createPostHogErrorReporter({
      apiKey: '',
      host: 'https://posthog.example.test',
    })

    await reporter.report(new Error('boom'), { where: 'test' })

    expect(calls).toHaveLength(0)
  })
})
