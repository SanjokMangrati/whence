import type { Database } from '../db/client'
import { DomainError } from '../domain/errors'
import { utcMonthOf } from '../domain/usage'
import { findJson, jobStepKey, putJson } from '../repositories/blobs'
import { claimDemoTranscriptCredit, claimDemoVerifierBudget } from '../repositories/demo-budget'

export interface SpendBudget {
  claimTranscript(jobId: string): Promise<void>
  claimVerifierCalls(jobId: string, step: string, calls: number): Promise<void>
}

interface DemoBudgetConfig {
  transcriptCredits: number
  verifierMicroUsd: number
  verifierMicroUsdPerCall: number
}

export const UNBOUNDED_BUDGET: SpendBudget = {
  claimTranscript: async () => {},
  claimVerifierCalls: async () => {},
}

export function spendBudgetFromEnv(env: Env, db: Database, bucket: R2Bucket): SpendBudget {
  if (
    env.DEMO_TRANSCRIPT_CREDITS === undefined ||
    env.DEMO_VERIFIER_MICRO_USD === undefined ||
    env.DEMO_VERIFIER_MICRO_USD_PER_CALL === undefined
  ) {
    return UNBOUNDED_BUDGET
  }
  return demoSpendBudget(db, bucket, {
    transcriptCredits: env.DEMO_TRANSCRIPT_CREDITS,
    verifierMicroUsd: env.DEMO_VERIFIER_MICRO_USD,
    verifierMicroUsdPerCall: env.DEMO_VERIFIER_MICRO_USD_PER_CALL,
  })
}

export function demoSpendBudget(
  db: Database,
  bucket: R2Bucket,
  config: DemoBudgetConfig,
): SpendBudget {
  const start = {
    transcriptCredits: config.transcriptCredits,
    verifierMicroUsd: config.verifierMicroUsd,
  }
  const period = () => utcMonthOf(new Date())

  async function claimOnce(key: string, claim: () => Promise<boolean>, message: string) {
    if ((await findJson<true>(bucket, key)) !== undefined) return
    if (!(await claim())) throw new DomainError('demo_budget_exhausted', message)
    await putJson(bucket, key, true)
  }

  return {
    claimTranscript: (jobId) =>
      claimOnce(
        jobStepKey(jobId, 'claim-transcript'),
        () => claimDemoTranscriptCredit(db, period(), start),
        'The demo has no transcript credits left this month.',
      ),
    claimVerifierCalls: (jobId, step, calls) =>
      claimOnce(
        jobStepKey(jobId, `claim-${step}`),
        () => claimDemoVerifierBudget(db, period(), calls * config.verifierMicroUsdPerCall, start),
        'The demo has no verifier budget left this month.',
      ),
  }
}
