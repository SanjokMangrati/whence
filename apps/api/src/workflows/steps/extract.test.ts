import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { Plan } from 'entitlements'
import { createDb } from '../../db/client'
import { findSourceById } from '../../repositories/sources'
import { UNBOUNDED_BUDGET, demoSpendBudget } from '../../services/spend-budget'
import { fakeGenerator } from '../../test/generator'
import { videoTranscript } from '../../test/sources'
import { extractSource, type ExtractDeps } from './extract'

const db = createDb(env.DB)

const MINUTE_MS = 60_000

interface FakeVideo {
  lengthMs: number
  captionsEndMs: number | null
}

function fakeDeps(video: FakeVideo, sentences = ['Spaced repetition works.']) {
  const calls = { lookups: 0, transcripts: 0 }
  const deps: ExtractDeps = {
    db,
    bucket: env.BUCKET,
    videos: {
      async lookup() {
        calls.lookups++
        return { title: 'Spaced repetition', channel: 'Memory Lab', lengthMs: video.lengthMs }
      },
    },
    transcripts: {
      async captions() {
        calls.transcripts++
        return video.captionsEndMs === null
          ? null
          : videoTranscript(sentences, video.captionsEndMs / sentences.length)
      },
    },
    articles: {
      async extract() {
        throw new Error('No article is extracted in these tests.')
      },
    },
    generator: fakeGenerator([]),
    budget: UNBOUNDED_BUDGET,
  }
  return { deps, calls }
}

function captioned(lengthMs: number): FakeVideo {
  return { lengthMs, captionsEndMs: lengthMs }
}

function extract(
  deps: ExtractDeps,
  normalizedUrl: string,
  plan: Plan,
  jobId: string = crypto.randomUUID(),
) {
  return extractSource(deps, {
    jobId,
    url: normalizedUrl,
    normalizedUrl,
    sourceType: 'video',
    plan,
  })
}

function videoUrl() {
  return `https://www.youtube.com/watch?v=${crypto.randomUUID().slice(0, 11)}`
}

describe('extract step', () => {
  it('serves a stored transcript to a later job with no provider call', async () => {
    const url = videoUrl()
    const stored = await extract(fakeDeps(captioned(10 * MINUTE_MS)).deps, url, 'free')

    const second = fakeDeps(captioned(10 * MINUTE_MS))
    const reused = await extract(second.deps, url, 'pro')

    expect(reused).toEqual(stored)
    expect(second.calls).toEqual({ lookups: 0, transcripts: 0 })
    expect(await findSourceById(db, stored.sourceId)).toMatchObject({
      title: 'Spaced repetition',
      channel: 'Memory Lab',
      lengthMs: 10 * MINUTE_MS,
    })
  })

  it('applies the plan length cap to a stored transcript', async () => {
    const url = videoUrl()
    await extract(fakeDeps(captioned(60 * MINUTE_MS)).deps, url, 'pro')

    const free = fakeDeps(captioned(60 * MINUTE_MS))
    await expect(extract(free.deps, url, 'free')).rejects.toMatchObject({
      code: 'source_too_long',
    })
    expect(free.calls).toEqual({ lookups: 0, transcripts: 0 })
  })

  it('refuses a video over the plan length before it pays for a transcript', async () => {
    const { deps, calls } = fakeDeps(captioned(40 * MINUTE_MS))

    await expect(extract(deps, videoUrl(), 'free')).rejects.toMatchObject({
      code: 'source_too_long',
    })
    expect(calls).toEqual({ lookups: 1, transcripts: 0 })
  })

  it('refuses a new video before the captions call when the demo has no transcript credits', async () => {
    const { deps, calls } = fakeDeps(captioned(10 * MINUTE_MS))
    deps.budget = demoSpendBudget(db, env.BUCKET, {
      transcriptCredits: 0,
      verifierMicroUsd: 0,
      verifierMicroUsdPerCall: 100,
    })

    await expect(extract(deps, videoUrl(), 'demo')).rejects.toMatchObject({
      code: 'demo_budget_exhausted',
    })
    expect(calls).toEqual({ lookups: 1, transcripts: 0 })
  })

  it('refuses a video with no captions', async () => {
    const { deps } = fakeDeps({ lengthMs: 10 * MINUTE_MS, captionsEndMs: null })

    await expect(extract(deps, videoUrl(), 'pro')).rejects.toMatchObject({
      code: 'captions_unavailable',
    })
  })

  it('treats captions that end before 80% of the video as no captions', async () => {
    const short = fakeDeps({ lengthMs: 20 * MINUTE_MS, captionsEndMs: 15 * MINUTE_MS })
    const full = fakeDeps({ lengthMs: 20 * MINUTE_MS, captionsEndMs: 16 * MINUTE_MS })

    await expect(extract(short.deps, videoUrl(), 'free')).rejects.toMatchObject({
      code: 'captions_unavailable',
    })
    await expect(extract(full.deps, videoUrl(), 'free')).resolves.toMatchObject({
      lengthMs: 20 * MINUTE_MS,
    })
  })

  it('reads the saved transcript when the step runs again for the same job', async () => {
    const url = videoUrl()
    const jobId = crypto.randomUUID()
    const { deps, calls } = fakeDeps(captioned(10 * MINUTE_MS), ['spaced repetition works'])
    let punctuated = 0
    deps.generator = {
      async generate(request) {
        punctuated++
        if (punctuated === 1) throw new Error('The model is overloaded.')
        return fakeGenerator(['Spaced repetition works.']).generate(request)
      },
    }

    await expect(extract(deps, url, 'free', jobId)).rejects.toThrow('overloaded')
    const result = await extract(deps, url, 'free', jobId)

    expect(calls).toEqual({ lookups: 1, transcripts: 1 })
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, costUsd: 0.001 })
  })

  it('stores punctuated captions with no generator call', async () => {
    const { deps } = fakeDeps(captioned(10 * MINUTE_MS))

    const result = await extract(deps, videoUrl(), 'free')

    expect(result.usage.costUsd).toBe(0)
  })

  it('caps an article by its reading time at 200 words a minute', async () => {
    const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ')
    const articleDeps = (text: string): ExtractDeps => ({
      ...fakeDeps(captioned(MINUTE_MS)).deps,
      articles: {
        async extract() {
          return {
            sourceType: 'article',
            title: 'Long read',
            channel: null,
            lengthMs: null,
            text,
            spans: [
              {
                ordinal: 0,
                kind: 'text',
                text,
                charStart: 0,
                charEnd: text.length,
                startMs: null,
                endMs: null,
              },
            ],
          }
        },
      },
    })
    const article = (text: string) =>
      extractSource(articleDeps(text), {
        jobId: crypto.randomUUID(),
        url: 'https://example.com/post',
        normalizedUrl: `https://example.com/post/${crypto.randomUUID()}`,
        sourceType: 'article',
        plan: 'free',
      })

    await expect(article(words(6000))).resolves.toMatchObject({ lengthMs: 30 * MINUTE_MS })
    await expect(article(words(6001))).rejects.toMatchObject({ code: 'source_too_long' })
  })
})
