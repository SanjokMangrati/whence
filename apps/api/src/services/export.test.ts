import { env } from 'cloudflare:workers'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { artifact, citation } from '../db/schema'
import type { SourceType } from '../domain/types'
import { artifactContentKey, putText, sourceTextKey } from '../repositories/blobs'
import { insertSourceWithSpans } from '../repositories/sources'
import { upsertSubscription } from '../repositories/subscriptions'
import { insertTestJob, insertTestUser } from '../test/factories'
import { exportArtifact } from './export'

const db = createDb(env.DB)
const deps = { db, bucket: env.BUCKET }

const SOURCE_TEXT =
  'Spacing works because forgetting matters. The interval grows after each review.'

const MARKDOWN = [
  '# Spaced repetition',
  '',
  '## Why spacing works',
  '- The interval grows after each review.[^1]',
  '  - Each review is later than the last.[^2]',
  '',
  '1. Review the card.[^3]',
  '2. Rate your recall.[^4]',
  '',
  '|  | Interval |',
  '| --- | --- |',
  '| Second review | Grows after each review.[^5] |',
].join('\n')

async function insertNotes(userId: string, sourceType: SourceType, markdown = MARKDOWN) {
  const sourceId = crypto.randomUUID()
  const spanId = crypto.randomUUID()
  const url = `https://example.com/${sourceId}`
  await putText(env.BUCKET, sourceTextKey(sourceId), SOURCE_TEXT)
  await insertSourceWithSpans(
    db,
    {
      id: sourceId,
      url,
      normalizedUrl: url,
      sourceType,
      contentHash: `hash-${sourceId}`,
      title: 'Spaced repetition',
      r2Key: sourceTextKey(sourceId),
      createdAt: new Date(),
    },
    [
      {
        id: spanId,
        sourceId,
        ordinal: 1,
        kind: 'text',
        charStart: 42,
        charEnd: SOURCE_TEXT.length,
        startMs: sourceType === 'video' ? 12_000 : null,
        endMs: sourceType === 'video' ? 18_000 : null,
        textHash: 'span-hash',
      },
    ],
  )
  const jobId = await insertTestJob(db, userId, sourceId)
  const artifactId = crypto.randomUUID()
  await putText(env.BUCKET, artifactContentKey(artifactId), markdown)
  await db.insert(artifact).values({
    id: artifactId,
    userId,
    jobId,
    sourceId,
    artifactType: 'notes',
    promptVersion: 'v1',
    modelId: 'test-model',
    contentR2Key: artifactContentKey(artifactId),
    entryCount: 1,
    createdAt: new Date(),
  })
  const markers = [...markdown.matchAll(/\[\^\d+\]/g)].length
  await db.insert(citation).values(
    Array.from({ length: markers }, (_, ordinal) => ({
      id: crypto.randomUUID(),
      ownerType: 'artifact' as const,
      ownerId: artifactId,
      spanId,
      ordinal,
      createdAt: new Date(),
    })),
  )
  return { artifactId, sourceUrl: url }
}

describe('artifact export', () => {
  let userId: string

  const text = async (file: { bytes: Uint8Array } | null) => new TextDecoder().decode(file!.bytes)

  beforeEach(async () => {
    userId = await insertTestUser(db)
    await upsertSubscription(db, {
      id: crypto.randomUUID(),
      userId,
      tier: 'pro',
      status: 'active',
      providerSubscriptionId: 'sub_1',
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('refuses a plan without export', async () => {
    const freeUserId = await insertTestUser(db)
    const { artifactId } = await insertNotes(freeUserId, 'video')

    await expect(exportArtifact(deps, freeUserId, artifactId, 'md')).rejects.toMatchObject({
      code: 'entitlement_required',
    })
  })

  it('exports nothing for another user', async () => {
    const { artifactId } = await insertNotes(await insertTestUser(db), 'video')

    expect(await exportArtifact(deps, userId, artifactId, 'md')).toBeNull()
  })

  it('renders Markdown whose markers link to the second of the video', async () => {
    const { artifactId, sourceUrl } = await insertNotes(userId, 'video')

    const file = await exportArtifact(deps, userId, artifactId, 'md')

    const marker = `[0:12](${sourceUrl}?t=12s)`
    expect(file).toMatchObject({
      contentType: 'text/markdown; charset=utf-8',
      filename: 'Spaced repetition - Notes.md',
    })
    expect(await text(file)).toBe(
      [
        '# Spaced repetition',
        '',
        `Notes · [YouTube video](${sourceUrl})`,
        '',
        '## Why spacing works',
        '',
        `- The interval grows after each review. ${marker}`,
        `  - Each review is later than the last. ${marker}`,
        '',
        `1. Review the card. ${marker}`,
        `2. Rate your recall. ${marker}`,
        '',
        '|  | Interval |',
        '| --- | --- |',
        `| Second review | Grows after each review. ${marker} |`,
        '',
      ].join('\n'),
    )
  })

  it('links an article marker to the address and escapes Markdown in the text', async () => {
    const { artifactId, sourceUrl } = await insertNotes(
      userId,
      'article',
      '- Write `a*b` for *emphasis*, not [x](y) or a_b.[^1]',
    )

    const file = await exportArtifact(deps, userId, artifactId, 'md')

    expect((await text(file)).split('\n')).toContain(
      String.raw`- Write ` +
        '`a*b`' +
        String.raw` for \*emphasis\*, not \[x\](y) or a\_b. [¶ 2](${sourceUrl})`,
    )
  })

  it('renders a DOCX with each block and its markers', async () => {
    const { artifactId, sourceUrl } = await insertNotes(userId, 'article')

    const file = await exportArtifact(deps, userId, artifactId, 'docx')

    const zip = await JSZip.loadAsync(file!.bytes)
    const body = await zip.file('word/document.xml')!.async('string')
    const relations = await zip.file('word/_rels/document.xml.rels')!.async('string')
    for (const text of [
      'Why spacing works',
      'The interval grows after each review.',
      'Each review is later than the last.',
      'Rate your recall.',
      'Second review',
    ]) {
      expect(body).toContain(text)
    }
    expect(body.match(/¶ 2/g)).toHaveLength(5)
    expect(relations).toContain(`Target="${sourceUrl}"`)
    expect(file?.filename).toBe('Spaced repetition - Notes.docx')
  })

  it('sets code from an article in the mono font without its backticks', async () => {
    const { artifactId } = await insertNotes(
      userId,
      'article',
      '- Narrow a union with `typeof x === "string"` first.[^1]',
    )

    const file = await exportArtifact(deps, userId, artifactId, 'docx')

    const zip = await JSZip.loadAsync(file!.bytes)
    const body = await zip.file('word/document.xml')!.async('string')
    const codeRun = /<w:r>(?:(?!<\/w:r>).)*Consolas(?:(?!<\/w:r>).)*<w:t[^>]*>([^<]*)<\/w:t>/g
    expect([...body.matchAll(codeRun)].map((match) => match[1])).toContain(
      'typeof x === &quot;string&quot;',
    )
    expect(body).not.toContain('`')
  })
})
