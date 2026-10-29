import { describe, expect, it } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { createSupadataTranscriptSource } from './transcript-source'

const FIRST = { text: 'Spaced repetition works.', offset: 0, duration: 2000, lang: 'en' }
const SECOND = { text: 'The interval grows.', offset: 2000, duration: 3000, lang: 'en' }
const CHUNKS = [FIRST, SECOND]

const source = createSupadataTranscriptSource({ apiKey: 'test-key' })

function answer(handler: (url: string) => Response) {
  return stubFetch((request) => handler(request.url))
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

describe('supadata transcript source', () => {
  it('returns spans with millisecond bounds and character ranges into the text', async () => {
    answer(() => json({ content: CHUNKS, lang: 'en' }))

    const transcript = (await source.captions('https://youtu.be/abc'))!

    expect(transcript.sourceType).toBe('video')
    expect(transcript.title).toBeNull()
    expect(transcript.lengthMs).toBe(5000)
    expect(transcript.spans).toEqual([
      {
        ordinal: 0,
        kind: 'text',
        text: FIRST.text,
        charStart: 0,
        charEnd: 24,
        startMs: 0,
        endMs: 2000,
      },
      {
        ordinal: 1,
        kind: 'text',
        text: SECOND.text,
        charStart: 25,
        charEnd: 44,
        startMs: 2000,
        endMs: 5000,
      },
    ])
    for (const span of transcript.spans) {
      expect(transcript.text.slice(span.charStart, span.charEnd)).toBe(span.text)
    }
  })

  it('splits a long chunk at sentence ends and keeps each part inside the chunk time', async () => {
    const long = {
      text: "tokenizer. I type I love programming. It's awesome. And I get seven tokens. Notice most tokens are for the words, but there are separate tokens for the period. This isn't random. Tokenizers are trained on text data to find efficient patterns. This happens before the model ever sees your input. It's a pre-processing step, not the neural network deciding how to split. Common words like 'the' get one token. Uncommon or long words get broken into subword pieces. So indistinguishable, that's",
      offset: 65280,
      duration: 33680,
      lang: 'en',
    }
    const next = {
      text: "four tokens. 'the' just one.",
      offset: 98960,
      duration: 2000,
      lang: 'en',
    }
    const unpunctuated = {
      text: Array.from({ length: 60 }, (_, index) => `word${index}`).join(' '),
      offset: 100960,
      duration: 18000,
      lang: 'en',
    }
    const chunks = [long, next, unpunctuated]
    answer(() => json({ content: chunks, lang: 'en' }))

    const { spans, text } = (await source.captions('https://youtu.be/abc'))!

    expect(spans.length).toBeGreaterThan(5)
    expect(spans.map((span) => span.ordinal)).toEqual([...spans.keys()])
    expect(spans.some((span) => span.text.includes("Common words like 'the' get one token."))).toBe(
      true,
    )
    const crossing = spans.find((span) => span.text.includes("that's four tokens."))
    expect(crossing).toBeDefined()
    expect(crossing!.startMs).toBeGreaterThan(long.offset)
    expect(crossing!.endMs).toBeGreaterThan(next.offset)
    expect(spans[0]!.startMs).toBe(65280)
    expect(spans.at(-1)!.endMs).toBe(118960)
    for (const [index, span] of spans.entries()) {
      expect(span.text.length).toBeLessThanOrEqual(140)
      expect(text.slice(span.charStart, span.charEnd)).toBe(span.text)
      expect(span.endMs!).toBeGreaterThan(span.startMs!)
      if (index > 0) expect(span.startMs!).toBeGreaterThanOrEqual(spans[index - 1]!.endMs!)
    }
    expect(spans.map((span) => span.text).join(' ')).toBe(
      chunks.map((chunk) => chunk.text).join(' '),
    )
  })

  it('keeps short chunks as they arrive', async () => {
    const spaced = { text: 'The interval  grows.', offset: 5000, duration: 1000, lang: 'en' }
    answer(() => json({ content: [FIRST, spaced], lang: 'en' }))

    const { spans } = (await source.captions('https://youtu.be/abc'))!

    expect(spans.map((span) => [span.text, span.startMs, span.endMs])).toEqual([
      [FIRST.text, 0, 2000],
      [spaced.text, 5000, 6000],
    ])
  })

  it('asks for existing English captions with the key in a header', async () => {
    const requests = answer(() => json({ content: CHUNKS, lang: 'en' }))

    await source.captions('https://www.youtube.com/watch?v=abc')

    expect(requests).toHaveLength(1)
    const url = new URL(requests[0]!.url)
    expect(url.origin + url.pathname).toBe('https://api.supadata.ai/v1/transcript')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      url: 'https://www.youtube.com/watch?v=abc',
      mode: 'native',
      lang: 'en',
    })
    expect(requests[0]!.headers.get('x-api-key')).toBe('test-key')
  })

  it('returns null for a video without captions', async () => {
    answer(() =>
      json(
        {
          error: 'transcript-unavailable',
          message: 'Transcript Unavailable',
          details: 'No transcript is available for this video',
          documentationUrl: 'https://docs.supadata.ai/errors/transcript-unavailable',
        },
        404,
      ),
    )

    expect(await source.captions('https://youtu.be/abc')).toBeNull()
  })

  it('returns null when a caption job finds no captions', async () => {
    answer((url) => {
      if (url.includes('/transcript/job-1')) {
        return json({
          status: 'failed',
          error: { error: 'transcript-unavailable', message: 'Transcript Unavailable' },
        })
      }
      return json({ jobId: 'job-1' }, 202)
    })

    expect(await source.captions('https://youtu.be/long')).toBeNull()
  })

  it('fails with a retryable error when Supadata returns a gateway page', async () => {
    answer(() => new Response('<html>Bad gateway</html>', { status: 502 }))

    await expect(source.captions('https://youtu.be/abc')).rejects.toMatchObject({
      code: 'extraction_failed',
      message: 'Supadata returned 502.',
    })
  })

  it('polls a job until it completes', async () => {
    answer((url) => {
      if (url.includes('/transcript/job-1')) {
        return json({ status: 'completed', content: CHUNKS })
      }
      return json({ jobId: 'job-1' }, 202)
    })

    const transcript = (await source.captions('https://youtu.be/long'))!
    expect(transcript.spans).toHaveLength(2)
  })

  it('fails visibly when a job fails', async () => {
    answer((url) => {
      if (url.includes('/transcript/job-1')) {
        return json({
          status: 'failed',
          error: { error: 'internal-error', message: 'Internal Error' },
        })
      }
      return json({ jobId: 'job-1' }, 202)
    })

    await expect(source.captions('https://youtu.be/gone')).rejects.toMatchObject({
      code: 'extraction_failed',
      message: 'Internal Error',
    })
  })
})
