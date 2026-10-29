import { and, asc, eq, inArray } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { citation } from '../db/schema'

export type NewCitation = InferInsertModel<typeof citation>

export async function listCitationsByOwner(
  db: Database,
  ownerType: NewCitation['ownerType'],
  ownerId: string,
) {
  return db
    .select()
    .from(citation)
    .where(and(eq(citation.ownerType, ownerType), eq(citation.ownerId, ownerId)))
}

export async function listCitationsByOwners(
  db: Database,
  ownerType: NewCitation['ownerType'],
  ownerIds: string[],
) {
  if (ownerIds.length === 0) return []
  return db
    .select()
    .from(citation)
    .where(and(eq(citation.ownerType, ownerType), inArray(citation.ownerId, ownerIds)))
    .orderBy(asc(citation.ordinal))
}
