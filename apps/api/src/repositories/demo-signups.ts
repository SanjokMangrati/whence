import { lt, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { demoSignup } from '../db/schema'

export async function claimDemoSignup(
  db: Database,
  claim: { address: string; day: string; limit: number },
) {
  const claimed = await db
    .insert(demoSignup)
    .values({ address: claim.address, day: claim.day, accounts: 1 })
    .onConflictDoUpdate({
      target: [demoSignup.address, demoSignup.day],
      set: { accounts: sql`${demoSignup.accounts} + 1` },
      setWhere: lt(demoSignup.accounts, claim.limit),
    })
    .returning({ accounts: demoSignup.accounts })
  return claimed.length === 1
}
