import type { Database } from '../../db/client'
import type { ArtifactType } from '../../domain/types'
import { sumUsage } from '../../domain/usage'
import {
  cacheOutputTypes,
  listArtifactCacheEntries,
  type CacheKey,
} from '../../repositories/artifact-cache'
import { listArtifactsByJob, type NewArtifact } from '../../repositories/artifacts'
import { artifactContentKey, getText, putText } from '../../repositories/blobs'
import { listCitationsByOwners, type NewCitation } from '../../repositories/citations'
import {
  findCommittedGeneration,
  insertCommittedGeneration,
  type CommittedIds,
} from '../../repositories/generation-commit'
import { listQaItemsByJob, type NewQaItem } from '../../repositories/qa-items'
import { NO_COUNTS, metricRow } from '../metrics'

export interface CacheInput {
  jobId: string
  userId: string
  key: CacheKey
  artifactTypes: ArtifactType[]
  stageDurationsMs: Record<string, number>
}

export async function serveFromCache(
  deps: { db: Database; bucket: R2Bucket },
  input: CacheInput,
): Promise<CommittedIds | null> {
  const committed = await findCommittedGeneration(deps.db, input.userId, input.jobId)
  if (committed !== null) return committed

  const outputTypes = cacheOutputTypes(input.artifactTypes)
  const entries = await listArtifactCacheEntries(deps.db, input.key, outputTypes)
  const canonicalJobId = entries[0]?.canonicalJobId
  if (
    canonicalJobId === undefined ||
    entries.length !== outputTypes.length ||
    entries.some((entry) => entry.canonicalJobId !== canonicalJobId)
  ) {
    return null
  }

  const [allArtifacts, canonicalQaItems] = await Promise.all([
    listArtifactsByJob(deps.db, canonicalJobId),
    listQaItemsByJob(deps.db, canonicalJobId),
  ])
  const canonicalArtifacts = allArtifacts.filter((row) =>
    input.artifactTypes.includes(row.artifactType),
  )
  if (canonicalArtifacts.length !== input.artifactTypes.length || canonicalQaItems.length === 0) {
    throw new Error(`Cached job ${canonicalJobId} no longer holds the rows its entry names.`)
  }

  const now = new Date()
  const newIds = new Map(
    [...canonicalArtifacts, ...canonicalQaItems].map((row) => [row.id, crypto.randomUUID()]),
  )
  const owner = { userId: input.userId, jobId: input.jobId, sourceId: input.key.sourceId }

  const artifacts: NewArtifact[] = canonicalArtifacts.map((row) => ({
    ...row,
    ...owner,
    id: newIds.get(row.id)!,
    contentR2Key: artifactContentKey(newIds.get(row.id)!),
    createdAt: now,
  }))
  const qaItems: NewQaItem[] = canonicalQaItems.map((row) => ({
    ...row,
    ...owner,
    id: newIds.get(row.id)!,
    removedAt: null,
    createdAt: now,
  }))

  const [artifactCitations, qaCitations] = await Promise.all([
    listCitationsByOwners(
      deps.db,
      'artifact',
      canonicalArtifacts.map((row) => row.id),
    ),
    listCitationsByOwners(
      deps.db,
      'qa_item',
      canonicalQaItems.map((row) => row.id),
    ),
    ...canonicalArtifacts.map(async (row) =>
      putText(
        deps.bucket,
        artifactContentKey(newIds.get(row.id)!),
        await getText(deps.bucket, row.contentR2Key),
      ),
    ),
  ])
  const citations: NewCitation[] = [...artifactCitations, ...qaCitations].map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    ownerId: newIds.get(row.ownerId)!,
    createdAt: now,
  }))

  await insertCommittedGeneration(deps.db, {
    jobId: input.jobId,
    artifacts,
    qaItems,
    citations,
    metric: metricRow(
      input.jobId,
      {
        modelId: input.key.modelId,
        usage: sumUsage([]),
        stageDurationsMs: input.stageDurationsMs,
        counts: NO_COUNTS,
      },
      now,
    ),
    cacheEntries: [],
    completedAt: now,
  })

  return {
    artifactIds: artifacts.map((row) => row.id),
    qaItemIds: qaItems.map((row) => row.id),
  }
}
