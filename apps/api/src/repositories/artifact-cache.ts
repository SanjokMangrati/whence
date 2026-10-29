import { and, eq, inArray } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { artifactCache } from '../db/schema'
import type { ArtifactType } from '../domain/types'

export type NewArtifactCacheEntry = InferInsertModel<typeof artifactCache>
export type CacheOutputType = NewArtifactCacheEntry['outputType']

export interface CacheKey {
  sourceId: string
  contentHash: string
  promptVersion: string
  modelId: string
}

export async function listArtifactCacheEntries(
  db: Database,
  key: CacheKey,
  outputTypes: CacheOutputType[],
) {
  if (outputTypes.length === 0) return []
  return db
    .select()
    .from(artifactCache)
    .where(
      and(
        eq(artifactCache.sourceId, key.sourceId),
        eq(artifactCache.contentHash, key.contentHash),
        eq(artifactCache.promptVersion, key.promptVersion),
        eq(artifactCache.modelId, key.modelId),
        inArray(artifactCache.outputType, outputTypes),
      ),
    )
}

export function cacheEntriesFor(input: {
  key: CacheKey
  artifactTypes: ArtifactType[]
  canonicalJobId: string
  createdAt: Date
}): NewArtifactCacheEntry[] {
  return [...input.artifactTypes, 'qa' as const].map((outputType) => ({
    id: crypto.randomUUID(),
    ...input.key,
    outputType,
    canonicalJobId: input.canonicalJobId,
    createdAt: input.createdAt,
  }))
}
