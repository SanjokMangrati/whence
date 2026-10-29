import { and, eq, gte, sql, type SQL } from 'drizzle-orm'
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'
import type { Database } from '../db/client'
import { demoBudget } from '../db/schema'

export interface DemoBudgetStart {
  transcriptCredits: number
  verifierMicroUsd: number
}

export async function claimDemoTranscriptCredit(
  db: Database,
  period: string,
  start: DemoBudgetStart,
) {
  return claim(db, period, start, gte(demoBudget.transcriptCreditsLeft, 1), {
    transcriptCreditsLeft: sql`${demoBudget.transcriptCreditsLeft} - 1`,
  })
}

export async function claimDemoVerifierBudget(
  db: Database,
  period: string,
  microUsd: number,
  start: DemoBudgetStart,
) {
  return claim(db, period, start, gte(demoBudget.verifierMicroUsdLeft, microUsd), {
    verifierMicroUsdLeft: sql`${demoBudget.verifierMicroUsdLeft} - ${microUsd}`,
  })
}

async function claim(
  db: Database,
  period: string,
  start: DemoBudgetStart,
  enough: SQL,
  spend: SQLiteUpdateSetSource<typeof demoBudget>,
) {
  const [, claimed] = await db.batch([
    db
      .insert(demoBudget)
      .values({
        period,
        transcriptCreditsLeft: start.transcriptCredits,
        verifierMicroUsdLeft: start.verifierMicroUsd,
      })
      .onConflictDoNothing(),
    db
      .update(demoBudget)
      .set(spend)
      .where(and(eq(demoBudget.period, period), enough))
      .returning({ period: demoBudget.period }),
  ])
  return claimed.length === 1
}
