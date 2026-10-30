import { DEMO_ACCOUNT_DAYS } from 'entitlements'
import type { Database } from '../db/client'
import { purgeDemoAccounts } from '../repositories/demo-accounts'

const DAY_MS = 24 * 60 * 60 * 1000

export function purgeExpiredDemoAccounts(db: Database, now: Date) {
  return purgeDemoAccounts(db, {
    createdBefore: new Date(now.getTime() - DEMO_ACCOUNT_DAYS * DAY_MS),
    signupsBefore: now.toISOString().slice(0, 10),
    now,
  })
}
