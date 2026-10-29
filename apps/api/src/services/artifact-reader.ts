import type { Database } from '../db/client'
import { findArtifactForUser } from '../repositories/artifacts'
import { getText, sourceTextKey } from '../repositories/blobs'
import { listCitationsByOwner } from '../repositories/citations'
import { findGenerationJobForUser } from '../repositories/generation-jobs'
import { findSourceById, listSpansForSource } from '../repositories/sources'

export interface ReaderDeps {
  db: Database
  bucket: R2Bucket
}

export async function readArtifact(deps: ReaderDeps, userId: string, artifactId: string) {
  const row = await findArtifactForUser(deps.db, userId, artifactId)
  if (row === undefined) return null

  const [source, markdown, citations] = await Promise.all([
    loadSourceRef(deps.db, row.sourceId),
    getText(deps.bucket, row.contentR2Key),
    listCitationsByOwner(deps.db, 'artifact', row.id),
  ])
  return {
    id: row.id,
    artifactType: row.artifactType,
    createdAt: row.createdAt,
    source,
    markdown,
    citations: await resolveAnchors(deps, row.sourceId, citations),
  }
}

export async function readJobSource(deps: ReaderDeps, userId: string, jobId: string) {
  const job = await findGenerationJobForUser(deps.db, userId, jobId)
  if (job === undefined || job.sourceId === null) return null

  const [source, spans, text] = await Promise.all([
    loadSourceRef(deps.db, job.sourceId),
    listSpansForSource(deps.db, job.sourceId),
    getText(deps.bucket, sourceTextKey(job.sourceId)),
  ])
  return {
    source,
    spans: spans.map((span) => ({
      id: span.id,
      ordinal: span.ordinal,
      kind: span.kind,
      startMs: span.startMs,
      endMs: span.endMs,
      text: text.slice(span.charStart, span.charEnd),
    })),
  }
}

async function loadSourceRef(db: Database, sourceId: string) {
  const row = await findSourceById(db, sourceId)
  if (row === undefined) {
    throw new Error(`Source ${sourceId} is missing for a committed artifact.`)
  }
  return {
    id: row.id,
    sourceType: row.sourceType,
    title: row.title,
    channel: row.channel,
    url: row.url,
  }
}

async function resolveAnchors(
  deps: ReaderDeps,
  sourceId: string,
  citations: { id: string; ordinal: number; spanId: string }[],
) {
  if (citations.length === 0) return []

  const [spans, text] = await Promise.all([
    listSpansForSource(deps.db, sourceId),
    getText(deps.bucket, sourceTextKey(sourceId)),
  ])
  const byId = new Map(spans.map((span) => [span.id, span]))

  return citations
    .toSorted((left, right) => left.ordinal - right.ordinal)
    .map((row) => {
      const span = byId.get(row.spanId)
      if (span === undefined) {
        throw new Error(
          `Citation ${row.id} cites span ${row.spanId}, which source ${sourceId} lacks.`,
        )
      }
      return {
        id: row.id,
        ordinal: row.ordinal,
        spanId: span.id,
        spanOrdinal: span.ordinal,
        spanKind: span.kind,
        startMs: span.startMs,
        endMs: span.endMs,
        charStart: span.charStart,
        charEnd: span.charEnd,
        text: text.slice(span.charStart, span.charEnd),
      }
    })
}
