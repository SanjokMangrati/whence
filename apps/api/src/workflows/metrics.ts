import type { TokenUsage } from '../domain/types'
import type { GenerationStage } from '../repositories/generation-jobs'
import type { NewGenerationMetric } from '../repositories/generation-metrics'
import { PROMPT_VERSION } from './prompts'

export interface MetricCounts {
  claimsGenerated: number
  claimsRejected: number
  claimsRewritten: number
  conceptsUnsupported: number
  conceptsRewritten: number
  stepsUnsupported: number
  stepsRewritten: number
  citationsInvalid: number
  verifierCalls: number
}

export interface Measures {
  modelId: string
  usage: TokenUsage
  stageDurationsMs: Record<string, number>
  counts: MetricCounts
}

export function metricRow(
  jobId: string,
  measures: Measures,
  createdAt: Date,
  failureStage: GenerationStage | null = null,
): NewGenerationMetric {
  return {
    id: crypto.randomUUID(),
    jobId,
    modelId: measures.modelId,
    promptVersion: PROMPT_VERSION,
    ...measures.usage,
    stageDurationsMs: JSON.stringify(measures.stageDurationsMs),
    failureStage,
    ...measures.counts,
    createdAt,
  }
}
