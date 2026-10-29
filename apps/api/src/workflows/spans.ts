import type { Database } from '../db/client'
import type { SpanKind } from '../domain/types'
import { getText, sourceTextKey } from '../repositories/blobs'
import { findSourceById, listSpansForSource } from '../repositories/sources'
import { renderSpanLines, type SourceDocument } from './prompts'

export interface SpanView {
  id: string
  ordinal: number
  kind: SpanKind
  text: string
}

export async function loadSpanViews(
  db: Database,
  bucket: R2Bucket,
  sourceId: string,
): Promise<SpanView[]> {
  const [rows, text] = await Promise.all([
    listSpansForSource(db, sourceId),
    getText(bucket, sourceTextKey(sourceId)),
  ])
  return rows.map((row) => ({
    id: row.id,
    ordinal: row.ordinal,
    kind: row.kind,
    text: text.slice(row.charStart, row.charEnd),
  }))
}

export async function loadSourceDocument(
  db: Database,
  bucket: R2Bucket,
  sourceId: string,
): Promise<{ spans: SpanView[]; document: SourceDocument }> {
  const [row, spans] = await Promise.all([
    findSourceById(db, sourceId),
    loadSpanViews(db, bucket, sourceId),
  ])
  if (row === undefined) {
    throw new Error(`Source ${sourceId} is missing.`)
  }
  return {
    spans,
    document: { title: row.title, sourceType: row.sourceType, spanLines: renderSpanLines(spans) },
  }
}

export function spanIdByOrdinal(spans: { id: string; ordinal: number }[]): Map<number, string> {
  return new Map(spans.map((span) => [span.ordinal, span.id]))
}

export function ordinalBySpanId(spans: { id: string; ordinal: number }[]): Map<string, number> {
  return new Map(spans.map((span) => [span.id, span.ordinal]))
}

const CONTEXT_SPANS_BEFORE = 2
const CONTEXT_SPANS_AFTER = 1
const CONTEXT_CHARS = 600

export function withContext(spanIds: string[], spans: SpanView[]): SpanView[][] {
  const byId = new Map(spans.map((span) => [span.id, span]))
  const byOrdinal = new Map(spans.map((span) => [span.ordinal, span]))
  const included = new Set(
    spanIds.map((spanId) => {
      const span = byId.get(spanId)
      if (span === undefined) {
        throw new Error(`Span ${spanId} is not in the source it is cited from.`)
      }
      return span.ordinal
    }),
  )

  const extend = (from: SpanView, step: -1 | 1, count: number) => {
    let used = 0
    for (let ordinal = from.ordinal + step; count > 0; ordinal += step, count--) {
      const next = byOrdinal.get(ordinal)
      if (next === undefined || included.has(ordinal)) return
      used += next.text.length
      if (used > CONTEXT_CHARS) return
      included.add(ordinal)
    }
  }
  for (const run of toRuns(included, byOrdinal)) {
    extend(run[0]!, -1, CONTEXT_SPANS_BEFORE)
    extend(run.at(-1)!, 1, CONTEXT_SPANS_AFTER)
  }
  return toRuns(included, byOrdinal)
}

export function evidenceOf(spanIds: string[], spans: SpanView[]): string[] {
  return withContext(spanIds, spans).map((run) => run.map((span) => span.text).join(' '))
}

function toRuns(included: Set<number>, byOrdinal: Map<number, SpanView>): SpanView[][] {
  const runs: SpanView[][] = []
  for (const ordinal of [...included].sort((a, b) => a - b)) {
    const run = runs.at(-1)
    const span = byOrdinal.get(ordinal)!
    if (run !== undefined && run.at(-1)!.ordinal === ordinal - 1) run.push(span)
    else runs.push([span])
  }
  return runs
}
