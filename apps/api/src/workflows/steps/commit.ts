import type { Database } from '../../db/client'
import { cacheEntriesFor } from '../../repositories/artifact-cache'
import type { NewArtifact } from '../../repositories/artifacts'
import { artifactContentKey, getJson, jobStepKey, putText } from '../../repositories/blobs'
import type { NewCitation } from '../../repositories/citations'
import {
  findCommittedGeneration,
  insertCommittedGeneration,
  type CommittedIds,
} from '../../repositories/generation-commit'
import type { NewQaItem } from '../../repositories/qa-items'
import { findSourceById } from '../../repositories/sources'
import type { DraftArtifact, DraftClaim, DraftSet } from '../drafts'
import { metricRow, type Measures } from '../metrics'
import { PROMPT_VERSION } from '../prompts'

export interface CommitInput {
  jobId: string
  userId: string
  sourceId: string
  configuredModelId: string
  measures: Measures
}

export async function commitGeneration(
  deps: { db: Database; bucket: R2Bucket },
  input: CommitInput,
): Promise<CommittedIds> {
  const committed = await findCommittedGeneration(deps.db, input.userId, input.jobId)
  if (committed !== null) return committed

  const verified = await getJson<DraftSet>(deps.bucket, jobStepKey(input.jobId, 'verified'))
  const source = await findSourceById(deps.db, input.sourceId)
  if (source === undefined) {
    throw new Error(`Source ${input.sourceId} is missing at commit.`)
  }

  const now = new Date()
  const artifacts: NewArtifact[] = []
  const qaItems: NewQaItem[] = []
  const citations: NewCitation[] = []

  for (const draft of verified.artifacts) {
    const artifactId = crypto.randomUUID()
    const rendered = render(draft, source.title, artifactId, now)
    citations.push(...rendered.citations)

    await putText(deps.bucket, artifactContentKey(artifactId), rendered.markdown)
    artifacts.push({
      id: artifactId,
      userId: input.userId,
      jobId: input.jobId,
      sourceId: input.sourceId,
      artifactType: draft.artifactType,
      promptVersion: PROMPT_VERSION,
      modelId: input.measures.modelId,
      contentR2Key: artifactContentKey(artifactId),
      entryCount: draft.sections
        .flatMap((section) => section.entries)
        .filter((entry) => entry.kind === 'claim').length,
      createdAt: now,
    })
  }

  for (const draft of verified.qaItems) {
    const qaItemId = crypto.randomUUID()
    qaItems.push({
      id: qaItemId,
      userId: input.userId,
      jobId: input.jobId,
      sourceId: input.sourceId,
      question: draft.question,
      answer: draft.answer,
      promptVersion: PROMPT_VERSION,
      modelId: input.measures.modelId,
      createdAt: now,
    })
    citations.push(
      ...draft.spanIds.map((spanId, ordinal) => ({
        id: crypto.randomUUID(),
        ownerType: 'qa_item' as const,
        ownerId: qaItemId,
        spanId,
        ordinal,
        createdAt: now,
      })),
    )
  }

  await insertCommittedGeneration(deps.db, {
    jobId: input.jobId,
    artifacts,
    qaItems,
    citations,
    metric: metricRow(input.jobId, input.measures, now),
    cacheEntries: cacheEntriesFor({
      key: {
        sourceId: input.sourceId,
        contentHash: source.contentHash,
        promptVersion: PROMPT_VERSION,
        modelId: input.configuredModelId,
      },
      artifactTypes: verified.artifacts.map((draft) => draft.artifactType),
      canonicalJobId: input.jobId,
      createdAt: now,
    }),
    completedAt: now,
  })

  return {
    artifactIds: artifacts.map((row) => row.id),
    qaItemIds: qaItems.map((row) => row.id),
  }
}

function render(
  draft: DraftArtifact,
  title: string | null,
  artifactId: string,
  createdAt: Date,
): { markdown: string; citations: NewCitation[] } {
  const citations: NewCitation[] = []
  const lines = title === null ? [] : [`# ${title}`, '']

  const cite = (claim: DraftClaim) =>
    claim.text +
    claim.spanIds
      .map((spanId) => {
        const ordinal = citations.length
        citations.push({
          id: crypto.randomUUID(),
          ownerType: 'artifact',
          ownerId: artifactId,
          spanId,
          ordinal,
          createdAt,
        })
        return `[^${ordinal + 1}]`
      })
      .join('')

  const block = (rows: string[]) => {
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('')
    lines.push(...rows, '')
  }

  for (const section of draft.sections) {
    lines.push(`## ${section.heading}`)
    for (const entry of section.entries) {
      switch (entry.kind) {
        case 'claim':
          lines.push(`- ${cite(entry.claim)}`)
          lines.push(...entry.details.map((detail) => `  - ${cite(detail)}`))
          break
        case 'steps':
          block(entry.steps.map((step, index) => `${index + 1}. ${cite(step)}`))
          break
        case 'table':
          block([
            tableRow(['', ...entry.columns]),
            tableRow(entry.columns.concat('').map(() => '---')),
            ...entry.rows.map((row) =>
              tableRow([row.label, ...row.cells.map((cell) => (cell === null ? '' : cite(cell)))]),
            ),
          ])
          break
      }
    }
  }

  while (lines.at(-1) === '') lines.pop()
  return { markdown: lines.join('\n'), citations }
}

function tableRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`
}
