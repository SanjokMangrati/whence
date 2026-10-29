import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { extractFromHtml } from '../providers/readability/article-extractor'
import { getText, sourceTextKey } from '../repositories/blobs'
import { listSpansForSource } from '../repositories/sources'
import { videoTranscript } from '../test/sources'
import { buildCanonicalSource } from './canonical-source'

const db = createDb(env.DB)

const ARTICLE_HTML = `<!doctype html>
<html><head><title>Spaced repetition works</title></head>
<body><article>
  <h1>Spaced repetition works</h1>
  <p>Recall improves when reviews are spread over time.</p>
  <p>The interval grows after each successful review.</p>
</article></body></html>`

function videoUrl() {
  return `https://www.youtube.com/watch?v=${crypto.randomUUID().slice(0, 11)}`
}

describe('canonical source', () => {
  it('writes ordered video spans whose ranges and bounds resolve', async () => {
    const url = videoUrl()
    const { sourceId } = await buildCanonicalSource(db, env.BUCKET, {
      url,
      normalizedUrl: url,
      extracted: videoTranscript(['Spaced repetition works.', 'The interval grows.'], 2000),
    })

    const spans = await listSpansForSource(db, sourceId)
    const text = await getText(env.BUCKET, sourceTextKey(sourceId))

    expect(spans.map((span) => span.ordinal)).toEqual([0, 1])
    expect(spans.map((span) => text.slice(span.charStart, span.charEnd))).toEqual([
      'Spaced repetition works.',
      'The interval grows.',
    ])
    expect(spans.map((span) => [span.startMs, span.endMs])).toEqual([
      [0, 2000],
      [2000, 4000],
    ])
  })

  it('writes ordered article spans with no millisecond bounds', async () => {
    const extracted = extractFromHtml(ARTICLE_HTML, 'https://example.com/post')
    const { sourceId } = await buildCanonicalSource(db, env.BUCKET, {
      url: 'https://example.com/post',
      normalizedUrl: 'https://example.com/post',
      extracted,
    })

    const spans = await listSpansForSource(db, sourceId)
    const text = await getText(env.BUCKET, sourceTextKey(sourceId))

    expect(spans.map((span) => span.ordinal)).toEqual([...spans.keys()])
    for (const span of spans) {
      expect(text.slice(span.charStart, span.charEnd)).toBe(extracted.spans[span.ordinal]!.text)
      expect(span.startMs).toBeNull()
      expect(span.endMs).toBeNull()
    }
  })

  it('reuses the row when the same url returns the same content', async () => {
    const url = videoUrl()
    const input = {
      url,
      normalizedUrl: url,
      extracted: videoTranscript(['Spaced repetition works.', 'The interval grows.'], 2000),
    }

    const first = await buildCanonicalSource(db, env.BUCKET, input)
    const second = await buildCanonicalSource(db, env.BUCKET, input)

    expect(second.sourceId).toBe(first.sourceId)
    expect(await listSpansForSource(db, first.sourceId)).toHaveLength(2)
  })

  it('writes a new row when the same url returns new content', async () => {
    const url = videoUrl()
    const first = await buildCanonicalSource(db, env.BUCKET, {
      url,
      normalizedUrl: url,
      extracted: videoTranscript(['Spaced repetition works.'], 2000),
    })
    const second = await buildCanonicalSource(db, env.BUCKET, {
      url,
      normalizedUrl: url,
      extracted: videoTranscript(['Spaced repetition works well.'], 2000),
    })

    expect(second.sourceId).not.toBe(first.sourceId)
    expect(second.contentHash).not.toBe(first.contentHash)
  })
})
