import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { claimDemoSignup } from './demo-signups'

const db = createDb(env.DB)

describe('demo signup repository', () => {
  it('claims accounts for one address until the limit of the day', async () => {
    const claim = { address: '203.0.113.10', day: '2030-01-01', limit: 2 }

    expect(await claimDemoSignup(db, claim)).toBe(true)
    expect(await claimDemoSignup(db, claim)).toBe(true)
    expect(await claimDemoSignup(db, claim)).toBe(false)
  })

  it('counts each address and each day apart', async () => {
    const claim = { address: '203.0.113.11', day: '2030-01-01', limit: 1 }

    expect(await claimDemoSignup(db, claim)).toBe(true)
    expect(await claimDemoSignup(db, { ...claim, address: '203.0.113.12' })).toBe(true)
    expect(await claimDemoSignup(db, { ...claim, day: '2030-01-02' })).toBe(true)
    expect(await claimDemoSignup(db, claim)).toBe(false)
  })
})
