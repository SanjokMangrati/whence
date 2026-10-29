import type { Database } from '../db/client'
import type { ExtractedSource } from '../domain/types'
import { putText, sourceTextKey } from '../repositories/blobs'
import {
  findSourceByContent,
  insertSourceWithSpans,
  type NewSourceSpan,
} from '../repositories/sources'

export interface CanonicalSourceInput {
  url: string
  normalizedUrl: string
  extracted: ExtractedSource
}

export interface CanonicalSource {
  sourceId: string
  contentHash: string
}

export async function buildCanonicalSource(
  db: Database,
  bucket: R2Bucket,
  input: CanonicalSourceInput,
): Promise<CanonicalSource> {
  const { extracted, normalizedUrl } = input
  const contentHash = await sha256(
    `${extracted.spans.map((span) => span.kind).join(',')}\n${extracted.text}`,
  )

  const existing = await findSourceByContent(db, normalizedUrl, contentHash)
  if (existing !== undefined) {
    return { sourceId: existing.id, contentHash }
  }

  const sourceId = crypto.randomUUID()
  const spans: NewSourceSpan[] = await Promise.all(
    extracted.spans.map(async (span) => ({
      id: crypto.randomUUID(),
      sourceId,
      ordinal: span.ordinal,
      kind: span.kind,
      startMs: span.startMs,
      endMs: span.endMs,
      charStart: span.charStart,
      charEnd: span.charEnd,
      textHash: await sha256(span.text),
    })),
  )

  await putText(bucket, sourceTextKey(sourceId), extracted.text)
  await insertSourceWithSpans(
    db,
    {
      id: sourceId,
      url: input.url,
      normalizedUrl,
      sourceType: extracted.sourceType,
      contentHash,
      title: extracted.title,
      channel: extracted.channel,
      lengthMs: extracted.lengthMs,
      r2Key: sourceTextKey(sourceId),
      createdAt: new Date(),
    },
    spans,
  )

  return { sourceId, contentHash }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
