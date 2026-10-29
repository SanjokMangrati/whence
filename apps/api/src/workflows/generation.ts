import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from 'cloudflare:workers'
import type { Plan } from 'entitlements'
import { createDb } from '../db/client'
import { DomainError } from '../domain/errors'
import type { OutputType, TokenUsage } from '../domain/types'
import { sumUsage } from '../domain/usage'
import { createJevClaimVerifier } from '../providers/jev/claim-verifier'
import { errorReporterFromEnv } from '../providers/posthog/error-reporter'
import { createReadabilityArticleExtractor } from '../providers/readability/article-extractor'
import { createSupadataTranscriptSource } from '../providers/supadata/transcript-source'
import { createYouTubeVideoMetadataSource } from '../providers/youtube/video-metadata-source'
import { updateGenerationJobStage, type GenerationStage } from '../repositories/generation-jobs'
import { artifactTypesFor } from './drafts'
import { isPermanentFailure, permanentAware, recordFailure } from './failure'
import { generatorForJob } from './generator'
import { NO_COUNTS, type Measures, type MetricCounts } from './metrics'
import { PROMPT_VERSION } from './prompts'
import { serveFromCache } from './steps/cache'
import { checkConcepts } from './steps/check-concepts'
import { commitGeneration } from './steps/commit'
import { extractConcepts } from './steps/concepts'
import { extractSource } from './steps/extract'
import { generateDrafts } from './steps/generate'
import { validateSource } from './steps/validate'
import { verifyDrafts } from './steps/verify'

const STAGE_RETRIES: WorkflowStepConfig = {
  retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
}

export interface GenerationParams {
  jobId: string
  userId: string
  requestedUrl: string
  outputType: OutputType
  plan: Plan
}

export class GenerationWorkflow extends WorkflowEntrypoint<Env, GenerationParams> {
  async run(event: Readonly<WorkflowEvent<GenerationParams>>, step: WorkflowStep) {
    const { jobId, userId, requestedUrl, outputType, plan } = event.payload
    const env = this.env
    const db = createDb(env.DB)
    const bucket = env.BUCKET
    const generator = () => generatorForJob(env, db, jobId)
    const verifier = createJevClaimVerifier({ apiKey: env.JEV_API_KEY })

    const durations: Record<string, number> = {}
    const usages: TokenUsage[] = []
    const counts: MetricCounts = { ...NO_COUNTS }
    let modelId: string = env.GENERATOR_MODEL_ID
    let stage: GenerationStage = 'validate'

    const measures = (): Measures => ({
      modelId,
      usage: sumUsage(usages),
      stageDurationsMs: durations,
      counts,
    })

    async function runStage<T extends Rpc.Serializable<T>>(
      next: GenerationStage,
      name: string,
      run: () => Promise<T>,
    ): Promise<T> {
      stage = next
      const started = Date.now()
      try {
        const result = await step.do(name, STAGE_RETRIES, () =>
          permanentAware(async () => {
            const attemptStarted = Date.now()
            await updateGenerationJobStage(db, jobId, {
              stage: next,
              status: 'running',
              updatedAt: new Date(),
            })
            const value = await run()
            return { value, durationMs: Date.now() - attemptStarted }
          }),
        )
        durations[next] = result.durationMs
        return result.value
      } catch (error) {
        durations[next] = Date.now() - started
        throw error
      }
    }

    try {
      const validated = await runStage('validate', 'validate', () => validateSource(requestedUrl))

      const extracted = await runStage('extract', 'extract', async () =>
        extractSource(
          {
            db,
            bucket,
            videos: createYouTubeVideoMetadataSource({ apiKey: env.YOUTUBE_API_KEY }),
            transcripts: createSupadataTranscriptSource({ apiKey: env.SUPADATA_API_KEY }),
            articles: createReadabilityArticleExtractor(),
            generator: await generator(),
          },
          { jobId, ...validated, plan },
        ),
      )
      usages.push(extracted.usage)
      const sourceId = extracted.sourceId

      await step.do('link-source', async () => {
        await updateGenerationJobStage(db, jobId, { sourceId, updatedAt: new Date() })
        return sourceId
      })

      const cached = await runStage('cache_check', 'cache-check', () =>
        serveFromCache(
          { db, bucket },
          {
            jobId,
            userId,
            key: {
              sourceId,
              contentHash: extracted.contentHash,
              promptVersion: PROMPT_VERSION,
              modelId: env.GENERATOR_MODEL_ID,
            },
            artifactTypes: artifactTypesFor(outputType),
            stageDurationsMs: durations,
          },
        ),
      )
      if (cached !== null) return cached

      const concepts = await runStage('extract_concepts', 'extract-concepts', async () =>
        extractConcepts({ db, bucket, generator: await generator() }, { jobId, sourceId }),
      )
      usages.push(concepts.usage)
      modelId = concepts.modelId
      counts.citationsInvalid += concepts.citationsInvalid

      const checked = await runStage('check_concepts', 'check-concepts', async () =>
        checkConcepts({ db, bucket, generator: await generator(), verifier }, { jobId, sourceId }),
      )
      usages.push(checked.usage)
      counts.conceptsUnsupported = checked.conceptsUnsupported
      counts.conceptsRewritten = checked.conceptsRewritten
      counts.verifierCalls += checked.verifierCalls

      const drafts = await runStage('generate', 'generate', async () =>
        generateDrafts(
          { db, bucket, generator: await generator() },
          { jobId, sourceId, outputType },
        ),
      )
      usages.push(drafts.usage)
      modelId = drafts.modelId

      const verified = await runStage('verify', 'verify', async () =>
        verifyDrafts({ db, bucket, generator: await generator(), verifier }, { jobId, sourceId }),
      )
      usages.push(verified.usage)
      counts.claimsGenerated = verified.claimsGenerated
      counts.claimsRejected = verified.claimsRejected
      counts.claimsRewritten = verified.claimsRewritten
      counts.citationsInvalid += verified.citationsInvalid
      counts.stepsUnsupported = verified.stepsUnsupported
      counts.stepsRewritten = verified.stepsRewritten
      counts.verifierCalls += verified.verifierCalls
      if (verified.unsupported !== null) {
        throw new DomainError('verification_failed', verified.unsupported)
      }

      return await runStage('commit', 'commit', () =>
        commitGeneration(
          { db, bucket },
          {
            jobId,
            userId,
            sourceId,
            configuredModelId: env.GENERATOR_MODEL_ID,
            measures: measures(),
          },
        ),
      )
    } catch (error) {
      const failedAt = stage
      const failure = await step.do('record-failure', () =>
        recordFailure(db, { jobId, plan, stage: failedAt, measures: measures(), error }),
      )
      if (!isPermanentFailure(failure.code)) {
        await step.do('report-failure', () =>
          errorReporterFromEnv(env).report(error, {
            where: `generation/${failedAt}`,
            userId,
            properties: { code: failure.code, job_id: jobId },
          }),
        )
      }
      throw error
    }
  }
}
