import { ENTITLEMENTS, type Entitlements, type Plan } from 'entitlements'
import type { Database } from '../../db/client'
import { DomainError } from '../../domain/errors'
import type {
  ArticleExtractor,
  Generator,
  TranscriptSource,
  VideoMetadataSource,
} from '../../domain/ports'
import { captionsCoverVideo, sourceLengthMs } from '../../domain/source-length'
import type { ExtractedSource, SourceType, TokenUsage } from '../../domain/types'
import { sumUsage } from '../../domain/usage'
import { findJson, jobStepKey, putJson } from '../../repositories/blobs'
import { findLatestTranscript } from '../../repositories/sources'
import { buildCanonicalSource } from '../../services/canonical-source'
import { toSentences } from '../sentences'

export interface ExtractDeps {
  db: Database
  bucket: R2Bucket
  videos: VideoMetadataSource
  transcripts: TranscriptSource
  articles: ArticleExtractor
  generator: Generator
}

export interface ExtractInput {
  jobId: string
  url: string
  normalizedUrl: string
  sourceType: SourceType
  plan: Plan
}

export interface ExtractResult {
  sourceId: string
  contentHash: string
  lengthMs: number
  usage: TokenUsage
}

export async function extractSource(
  deps: ExtractDeps,
  input: ExtractInput,
): Promise<ExtractResult> {
  const entitlements = ENTITLEMENTS[input.plan]

  if (input.sourceType === 'video') {
    const stored = await findLatestTranscript(deps.db, input.normalizedUrl)
    if (stored !== undefined && stored.lengthMs !== null) {
      refuseOverLength(stored.lengthMs, entitlements)
      return {
        sourceId: stored.id,
        contentHash: stored.contentHash,
        lengthMs: stored.lengthMs,
        usage: sumUsage([]),
      }
    }
  }

  const { extracted, usage } =
    input.sourceType === 'video'
      ? await extractVideo(deps, input, entitlements)
      : { extracted: await deps.articles.extract(input.url), usage: [] }

  const lengthMs = sourceLengthMs(extracted)
  refuseOverLength(lengthMs, entitlements)

  const canonical = await buildCanonicalSource(deps.db, deps.bucket, {
    url: input.url,
    normalizedUrl: input.normalizedUrl,
    extracted,
  })

  return { ...canonical, lengthMs, usage: sumUsage(usage) }
}

async function extractVideo(
  deps: ExtractDeps,
  input: ExtractInput,
  entitlements: Entitlements,
): Promise<{ extracted: ExtractedSource; usage: TokenUsage[] }> {
  const key = jobStepKey(input.jobId, 'transcript')
  let fetched = await findJson<ExtractedSource>(deps.bucket, key)
  if (fetched === undefined) {
    const video = await deps.videos.lookup(input.normalizedUrl)
    refuseOverLength(video.lengthMs, entitlements)

    const captions = await deps.transcripts.captions(input.normalizedUrl)
    if (captions === null || !captionsCoverVideo(captions.lengthMs ?? 0, video.lengthMs)) {
      throw new DomainError('captions_unavailable', 'The video has no full captions.')
    }
    fetched = { ...captions, title: video.title, channel: video.channel, lengthMs: video.lengthMs }
    await putJson(deps.bucket, key, fetched)
  }

  const { transcript, usage } = await toSentences(deps.generator, fetched)
  return { extracted: transcript, usage }
}

function refuseOverLength(lengthMs: number, entitlements: Entitlements) {
  if (lengthMs > entitlements.maxSourceLengthMs) {
    throw new DomainError(
      'source_too_long',
      `The source runs ${Math.round(lengthMs / 60_000)} minutes and the plan allows ${Math.round(entitlements.maxSourceLengthMs / 60_000)}.`,
    )
  }
}
