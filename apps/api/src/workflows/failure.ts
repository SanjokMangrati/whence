import { NonRetryableError } from 'cloudflare:workflows'
import { ENTITLEMENTS, type Plan } from 'entitlements'
import type { Database } from '../db/client'
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  FREE_FAILURE_CODES,
  type DomainErrorCode,
} from '../domain/errors'
import { updateGenerationJobStage, type GenerationStage } from '../repositories/generation-jobs'
import { insertGenerationMetric } from '../repositories/generation-metrics'
import {
  deleteUsageRecordForJob,
  returnUsageRecordForFailedJob,
} from '../repositories/usage-records'
import { metricRow, type Measures } from './metrics'

const PERMANENT_CODES = new Set<DomainErrorCode>([
  'unsupported_source',
  'private_address',
  'source_too_long',
  'captions_unavailable',
  'provider_key_required',
  'provider_key_rejected',
  'verification_failed',
  'too_many_claims',
  'demo_budget_exhausted',
])

const CODED_MESSAGE = /^(?:\w*Error: )*([a-z_]+): ([\s\S]*)$/

export function isPermanentFailure(code: DomainErrorCode) {
  return PERMANENT_CODES.has(code)
}

export async function permanentAware<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    const message = `${error.code}: ${error.message}`
    throw PERMANENT_CODES.has(error.code) ? new NonRetryableError(message) : new Error(message)
  }
}

export interface FailureInput {
  jobId: string
  plan: Plan
  stage: GenerationStage
  measures: Measures
  error: unknown
}

export async function recordFailure(db: Database, input: FailureInput) {
  const failure = toFailure(input.error)
  const now = new Date()

  await updateGenerationJobStage(db, input.jobId, {
    status: 'failed',
    stage: input.stage,
    errorCode: failure.code,
    errorMessage: failure.message,
    updatedAt: now,
  })
  if (FREE_FAILURE_CODES.includes(failure.code)) {
    await deleteUsageRecordForJob(db, input.jobId)
  } else {
    await returnUsageRecordForFailedJob(db, {
      jobId: input.jobId,
      limit: ENTITLEMENTS[input.plan].failedSourcesReturnedPerPeriod,
      now,
    })
  }
  await insertGenerationMetric(db, metricRow(input.jobId, input.measures, now, input.stage))

  return failure
}

export function toFailure(error: unknown): { code: DomainErrorCode; message: string } {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  const match = CODED_MESSAGE.exec(message)
  const code = DOMAIN_ERROR_CODES.find((known) => known === match?.[1])
  if (match !== null && code !== undefined) {
    return { code, message: match[2]! }
  }
  return { code: 'generation_failed', message }
}
