import type { Database } from '../../db/client'
import { DomainError } from '../../domain/errors'
import type { Generator } from '../../domain/ports'
import type { Concept, ConceptRole, OutputType, TokenUsage } from '../../domain/types'
import { sumUsage } from '../../domain/usage'
import { getJson, jobStepKey, putJson } from '../../repositories/blobs'
import {
  artifactTypesFor,
  countClaims,
  mapEntry,
  sectionsInSourceOrder,
  withoutRepeatedDetails,
  withoutRepeatsAcrossSections,
  type DraftArtifact,
  type DraftQaItem,
  type DraftSection,
  type DraftSet,
} from '../drafts'
import { parseQaItems, parseSections, toSpanIds, type RawClaim } from '../model-output'
import { artifactRequest, qaLimit, qaRequest, type ConceptView } from '../prompts'
import { loadSourceDocument, ordinalBySpanId, spanIdByOrdinal } from '../spans'

export interface GenerateStepResult {
  modelId: string
  usage: TokenUsage
}

const QA_ROLE_ORDER: ConceptRole[] = ['principle', 'worked_example', 'example', 'analogy']

export async function generateDrafts(
  deps: { db: Database; bucket: R2Bucket; generator: Generator },
  input: { jobId: string; sourceId: string; outputType: OutputType },
): Promise<GenerateStepResult> {
  const concepts = await getJson<Concept[]>(deps.bucket, jobStepKey(input.jobId, 'checked'))
  const { spans, document } = await loadSourceDocument(deps.db, deps.bucket, input.sourceId)
  const byOrdinal = spanIdByOrdinal(spans)
  const ordinalById = ordinalBySpanId(spans)

  const toOrdinals = (spanIds: string[]) =>
    spanIds.map((spanId) => {
      const ordinal = ordinalById.get(spanId)
      if (ordinal === undefined) {
        throw new Error(`Concept cites span ${spanId}, which source ${input.sourceId} lacks.`)
      }
      return ordinal
    })
  const toDraftClaim = (claim: RawClaim) => ({
    text: claim.text,
    ...toSpanIds(claim.spans, byOrdinal),
  })

  const inSourceOrder = concepts
    .map((concept) => ({ concept, ordinals: toOrdinals(concept.spanIds) }))
    .sort((a, b) => Math.min(...a.ordinals) - Math.min(...b.ordinals))
  const forArtifacts = inTopicOrder(inSourceOrder)
  const forQa = inSourceOrder
    .map((placed) => toView(placed, false))
    .sort((a, b) => QA_ROLE_ORDER.indexOf(a.role) - QA_ROLE_ORDER.indexOf(b.role))

  const [artifactResults, qaResult] = await Promise.all([
    Promise.all(
      artifactTypesFor(input.outputType).map(async (artifactType) => ({
        artifactType,
        result: await deps.generator.generate(
          artifactRequest(artifactType, document, forArtifacts),
        ),
      })),
    ),
    deps.generator.generate(qaRequest(document, forQa)),
  ])

  const artifacts: DraftArtifact[] = artifactResults.map(({ artifactType, result }) => {
    const parsed: DraftSection[] = parseSections(result.text).map((section) => ({
      heading: section.heading,
      entries: section.entries.map((entry) =>
        mapEntry(withoutRepeatedDetails(entry), toDraftClaim),
      ),
    }))
    if (countClaims(parsed) === 0) {
      throw new DomainError('generation_failed', `The model produced no ${artifactType} entry.`)
    }
    return {
      artifactType,
      sections: withoutRepeatsAcrossSections(sectionsInSourceOrder(parsed, ordinalById)),
    }
  })

  const qaItems: DraftQaItem[] = parseQaItems(qaResult.text)
    .slice(0, qaLimit(forQa))
    .map((item) => ({
      question: item.question,
      answer: item.answer,
      ...toSpanIds(item.spans, byOrdinal),
    }))
  if (qaItems.length === 0) {
    throw new DomainError('generation_failed', 'The model produced no question.')
  }

  const drafts: DraftSet = { artifacts, qaItems }
  await putJson(deps.bucket, jobStepKey(input.jobId, 'drafts'), drafts)
  return {
    modelId: qaResult.modelId,
    usage: sumUsage([...artifactResults.map(({ result }) => result.usage), qaResult.usage]),
  }
}

interface PlacedConcept {
  concept: Concept
  ordinals: number[]
}

function toView(
  { concept, ordinals }: PlacedConcept,
  followsPrinciple: boolean,
  topic = concept.topic,
): ConceptView {
  return {
    statement: concept.statement,
    role: concept.role,
    topic,
    followsPrinciple,
    ordinals,
  }
}

function inTopicOrder(concepts: PlacedConcept[]): ConceptView[] {
  const topicOf = topicGroups(concepts)
  const byId = new Map(concepts.map(({ concept }) => [concept.id, concept]))
  const casesOf = new Map<string, PlacedConcept[]>()
  const topics = new Map<string, PlacedConcept[]>()
  for (const placed of concepts) {
    const { concept } = placed
    const topic = topicOf(concept)
    const principle = concept.showsPrincipleIds.find((id) => {
      const shown = byId.get(id)
      return shown !== undefined && topicOf(shown) === topic
    })
    if (principle !== undefined) {
      casesOf.set(principle, [...(casesOf.get(principle) ?? []), placed])
      continue
    }
    topics.set(topic, [...(topics.get(topic) ?? []), placed])
  }
  return [...topics].flatMap(([topic, placed]) =>
    placed.flatMap((item) => [
      toView(item, false, topic),
      ...(casesOf.get(item.concept.id) ?? []).map((other) => toView(other, true, topic)),
    ]),
  )
}

function topicGroups(concepts: PlacedConcept[]): (concept: Concept) => string {
  const keyOf = (concept: Concept) => concept.topic.trim().toLowerCase()
  const topics = new Map<string, { name: string; count: number }>()
  for (const { concept } of concepts) {
    const topic = topics.get(keyOf(concept))
    if (topic === undefined) {
      topics.set(keyOf(concept), { name: concept.topic.trim(), count: 1 })
    } else {
      topic.count += 1
    }
  }

  const groups: { keys: string[]; names: string[]; count: number }[] = []
  for (const [key, { name, count }] of topics) {
    const last = groups.at(-1)
    if (count === 1 && last !== undefined) {
      last.keys.push(key)
      last.names.push(name)
      last.count += 1
    } else {
      groups.push({ keys: [key], names: [name], count })
    }
  }
  const [first, second] = groups
  if (first !== undefined && second !== undefined && first.count === 1) {
    second.keys.unshift(...first.keys)
    second.names.unshift(...first.names)
    groups.shift()
  }

  const nameOf = new Map(
    groups.flatMap((group) => group.keys.map((key) => [key, group.names.join(' / ')])),
  )
  return (concept) => nameOf.get(keyOf(concept))!
}
