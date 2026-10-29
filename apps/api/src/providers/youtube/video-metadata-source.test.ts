import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { createYouTubeVideoMetadataSource } from './video-metadata-source'

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const source = createYouTubeVideoMetadataSource({ apiKey: 'test-key' })

function answer(body: unknown, status = 200) {
  return stubFetch(() => Response.json(body, { status }))
}

function video(duration: string, liveBroadcastContent = 'none') {
  return {
    items: [
      {
        snippet: { title: 'Spaced repetition', channelTitle: 'Memory Lab', liveBroadcastContent },
        contentDetails: { duration },
      },
    ],
  }
}

describe('youtube video metadata source', () => {
  it('reads the title, channel, and length of the video the URL names', async () => {
    const calls = answer(video('PT1H2M3S'))

    const metadata = await source.lookup(VIDEO_URL)

    expect(metadata).toEqual({
      title: 'Spaced repetition',
      channel: 'Memory Lab',
      lengthMs: 3_723_000,
    })
    const url = new URL(calls[0]!.url)
    expect(url.searchParams.get('id')).toBe('dQw4w9WgXcQ')
    expect(url.searchParams.has('key')).toBe(false)
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('test-key')
  })

  it('reads a length with a day part', async () => {
    answer(video('P1DT2S'))

    expect((await source.lookup(VIDEO_URL)).lengthMs).toBe(86_402_000)
  })

  it('refuses a live stream, which reports a length of zero', async () => {
    answer(video('P0D', 'live'))

    await expect(source.lookup(VIDEO_URL)).rejects.toMatchObject({ code: 'unsupported_source' })
  })

  it('refuses a video YouTube does not return', async () => {
    answer({ items: [] })

    await expect(source.lookup(VIDEO_URL)).rejects.toMatchObject({ code: 'unsupported_source' })
  })

  it('turns a failed request into a retryable extraction failure', async () => {
    answer({ error: { code: 403, message: 'quotaExceeded' } }, 403)

    await expect(source.lookup(VIDEO_URL)).rejects.toMatchObject({ code: 'extraction_failed' })
  })
})
