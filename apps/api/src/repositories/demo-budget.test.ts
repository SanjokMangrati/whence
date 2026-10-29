import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { claimDemoTranscriptCredit, claimDemoVerifierBudget } from './demo-budget'

const db = createDb(env.DB)
const START = { transcriptCredits: 2, verifierMicroUsd: 100 }

describe('demo budget repository', () => {
  it('claims transcript credits until none are left', async () => {
    const period = '2030-01'

    expect(await claimDemoTranscriptCredit(db, period, START)).toBe(true)
    expect(await claimDemoTranscriptCredit(db, period, START)).toBe(true)
    expect(await claimDemoTranscriptCredit(db, period, START)).toBe(false)
  })

  it('refuses a verifier claim larger than what is left', async () => {
    const period = '2030-02'

    expect(await claimDemoVerifierBudget(db, period, 60, START)).toBe(true)
    expect(await claimDemoVerifierBudget(db, period, 60, START)).toBe(false)
    expect(await claimDemoVerifierBudget(db, period, 40, START)).toBe(true)
  })

  it('starts a new period from the start values', async () => {
    const one = { ...START, transcriptCredits: 1 }

    expect(await claimDemoTranscriptCredit(db, '2030-03', one)).toBe(true)
    expect(await claimDemoTranscriptCredit(db, '2030-03', one)).toBe(false)
    expect(await claimDemoTranscriptCredit(db, '2030-04', one)).toBe(true)
  })

  it('keeps the transcript credits when the verifier budget is spent', async () => {
    const period = '2030-05'

    expect(await claimDemoVerifierBudget(db, period, 100, START)).toBe(true)
    expect(await claimDemoTranscriptCredit(db, period, START)).toBe(true)
  })
})
