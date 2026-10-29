import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { UNBOUNDED_BUDGET, demoSpendBudget, spendBudgetFromEnv } from './spend-budget'

const db = createDb(env.DB)

const budget = demoSpendBudget(db, env.BUCKET, {
  transcriptCredits: 1,
  verifierMicroUsd: 1000,
  verifierMicroUsdPerCall: 100,
})

describe('spend budget', () => {
  it('claims one transcript credit for a job that runs the step twice', async () => {
    const jobId = crypto.randomUUID()

    await budget.claimTranscript(jobId)
    await budget.claimTranscript(jobId)

    await expect(budget.claimTranscript(crypto.randomUUID())).rejects.toMatchObject({
      code: 'demo_budget_exhausted',
    })
  })

  it('claims the verifier calls of a step once at the configured rate', async () => {
    const jobId = crypto.randomUUID()

    await budget.claimVerifierCalls(jobId, 'verified', 6)
    await budget.claimVerifierCalls(jobId, 'verified', 6)
    await budget.claimVerifierCalls(jobId, 'checked', 4)

    await expect(
      budget.claimVerifierCalls(crypto.randomUUID(), 'verified', 1),
    ).rejects.toMatchObject({ code: 'demo_budget_exhausted' })
  })

  it('bounds nothing in an environment with no demo budget', () => {
    expect(spendBudgetFromEnv(env, db, env.BUCKET)).toBe(UNBOUNDED_BUDGET)
  })
})
