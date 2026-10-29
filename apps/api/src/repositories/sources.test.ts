import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { findLatestTranscript, insertSourceWithSpans, listSpansForSource } from './sources'

const db = createDb(env.DB)

function sourceRow(id: string, normalizedUrl: string, createdAt: Date) {
  return {
    id,
    url: normalizedUrl,
    normalizedUrl,
    sourceType: 'video' as const,
    contentHash: `hash-${id}`,
    lengthMs: 60_000,
    r2Key: `sources/${id}.txt`,
    createdAt,
  }
}

describe('source repository', () => {
  it('writes a source with more spans than one D1 statement can bind', async () => {
    const sourceId = crypto.randomUUID()
    const spans = Array.from({ length: 200 }, (_, ordinal) => ({
      id: crypto.randomUUID(),
      sourceId,
      ordinal,
      startMs: ordinal * 1000,
      endMs: ordinal * 1000 + 1000,
      charStart: ordinal * 10,
      charEnd: ordinal * 10 + 10,
      textHash: `hash-${ordinal}`,
    }))

    await insertSourceWithSpans(
      db,
      sourceRow(sourceId, `https://example.com/${sourceId}`, new Date()),
      spans,
    )

    const stored = await listSpansForSource(db, sourceId)
    expect(stored.map((span) => span.ordinal)).toEqual(spans.map((span) => span.ordinal))
  })

  it('returns the newest transcript for a video URL', async () => {
    const url = `https://www.youtube.com/watch?v=${crypto.randomUUID().slice(0, 11)}`
    const olderId = crypto.randomUUID()
    const newerId = crypto.randomUUID()
    await insertSourceWithSpans(db, sourceRow(olderId, url, new Date(1_000_000)), [])
    await insertSourceWithSpans(db, sourceRow(newerId, url, new Date(2_000_000)), [])

    expect((await findLatestTranscript(db, url))?.id).toBe(newerId)
  })
})
