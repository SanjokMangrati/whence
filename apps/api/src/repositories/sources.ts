import { and, asc, desc, eq } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { source, sourceSpan } from '../db/schema'
import { insertChunks } from './insert-chunks'

export type NewSource = InferInsertModel<typeof source>
export type NewSourceSpan = InferInsertModel<typeof sourceSpan>

export async function findSourceByContent(
  db: Database,
  normalizedUrl: string,
  contentHash: string,
) {
  const [row] = await db
    .select()
    .from(source)
    .where(and(eq(source.normalizedUrl, normalizedUrl), eq(source.contentHash, contentHash)))
  return row
}

export async function findLatestTranscript(db: Database, normalizedUrl: string) {
  const [row] = await db
    .select()
    .from(source)
    .where(and(eq(source.normalizedUrl, normalizedUrl), eq(source.sourceType, 'video')))
    .orderBy(desc(source.createdAt))
    .limit(1)
  return row
}

export async function findSourceById(db: Database, id: string) {
  const [row] = await db.select().from(source).where(eq(source.id, id))
  return row
}

export async function insertSourceWithSpans(db: Database, row: NewSource, spans: NewSourceSpan[]) {
  await db.batch([
    db.insert(source).values(row),
    ...insertChunks(sourceSpan, spans).map((rows) => db.insert(sourceSpan).values(rows)),
  ])
}

export async function listSpansForSource(db: Database, sourceId: string) {
  return db
    .select()
    .from(sourceSpan)
    .where(eq(sourceSpan.sourceId, sourceId))
    .orderBy(asc(sourceSpan.ordinal))
}
