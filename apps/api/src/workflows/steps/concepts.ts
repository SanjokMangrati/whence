import type { Database } from '../../db/client'
import { DomainError } from '../../domain/errors'
import type { Generator } from '../../domain/ports'
import type { Concept, TokenUsage } from '../../domain/types'
import { jobStepKey, putJson } from '../../repositories/blobs'
import { parseConcepts, toSpanIds } from '../model-output'
import { conceptLimit, conceptRequest } from '../prompts'
import { loadSourceDocument, spanIdByOrdinal } from '../spans'

export interface ConceptStepResult {
  citationsInvalid: number
  modelId: string
  usage: TokenUsage
}

export async function extractConcepts(
  deps: { db: Database; bucket: R2Bucket; generator: Generator },
  input: { jobId: string; sourceId: string },
): Promise<ConceptStepResult> {
  const { spans, document } = await loadSourceDocument(deps.db, deps.bucket, input.sourceId)
  const result = await deps.generator.generate(conceptRequest(document))

  const entries = parseConcepts(result.text)
  const limit = conceptLimit(document)
  if (entries.length > limit) {
    throw new DomainError(
      'generation_failed',
      `The model listed ${entries.length} concepts. The limit for this source is ${limit}.`,
    )
  }

  const byOrdinal = spanIdByOrdinal(spans)
  const parsed = entries.map((entry) => ({
    id: crypto.randomUUID(),
    ...entry,
    ...toSpanIds(entry.spans, byOrdinal),
  }))
  const kept = parsed.filter((entry) => entry.invalidSpans === undefined)
  const principleIds = new Set(
    kept.filter((entry) => entry.role === 'principle').map((entry) => entry.id),
  )
  const concepts: Concept[] = kept.map((entry) => ({
    id: entry.id,
    statement: entry.statement,
    role: entry.role,
    topic: entry.topic,
    showsPrincipleIds:
      entry.role === 'principle' || entry.role === 'aside'
        ? []
        : [
            ...new Set(
              entry.shows
                .map((position) => parsed[position]?.id)
                .filter((id): id is string => id !== undefined && principleIds.has(id)),
            ),
          ],
    spanIds: entry.spanIds,
  }))

  if (concepts.length === 0) {
    throw new DomainError('generation_failed', 'The model found no concept in the source.')
  }

  await putJson(deps.bucket, jobStepKey(input.jobId, 'concepts'), concepts)
  return {
    citationsInvalid: parsed.length - concepts.length,
    modelId: result.modelId,
    usage: result.usage,
  }
}
