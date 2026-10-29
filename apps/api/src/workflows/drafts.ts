import type { ArtifactType, OutputType } from '../domain/types'

export interface DraftClaim {
  text: string
  spanIds: string[]
  invalidSpans?: number[]
}

export type Entry<C> =
  | { kind: 'claim'; claim: C; details: C[] }
  | { kind: 'steps'; steps: C[] }
  | { kind: 'table'; columns: string[]; rows: TableRow<C>[] }

export const MIN_MAPPING_ROWS = 3

export interface TableRow<C> {
  label: string
  cells: (C | null)[]
}

export interface Section<C> {
  heading: string
  entries: Entry<C>[]
}

export type DraftEntry = Entry<DraftClaim>
export type DraftSection = Section<DraftClaim>

export interface DraftArtifact {
  artifactType: ArtifactType
  sections: DraftSection[]
}

export interface DraftQaItem {
  question: string
  answer: string
  spanIds: string[]
  invalidSpans?: number[]
}

export interface DraftSet {
  artifacts: DraftArtifact[]
  qaItems: DraftQaItem[]
}

export function artifactTypesFor(outputType: OutputType): ArtifactType[] {
  return outputType === 'notes_and_cheat_sheet' ? ['notes', 'cheat_sheet'] : [outputType]
}

export function mapEntry<A, B>(entry: Entry<A>, map: (claim: A) => B): Entry<B> {
  switch (entry.kind) {
    case 'claim':
      return { kind: 'claim', claim: map(entry.claim), details: entry.details.map(map) }
    case 'steps':
      return { kind: 'steps', steps: entry.steps.map(map) }
    case 'table':
      return {
        kind: 'table',
        columns: entry.columns,
        rows: entry.rows.map((row) => ({
          label: row.label,
          cells: row.cells.map((cell) => (cell === null ? null : map(cell))),
        })),
      }
  }
}

const REPEATED_WORD_SHARE = 0.8

const WORD = /[\p{L}\p{N}]+(?:[.,]\p{N}+)*/gu

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? []
}

function repeats(text: string, other: string): boolean {
  const otherWords = new Set(wordsOf(other))
  const words = wordsOf(text)
  const shared = words.filter((word) => otherWords.has(word)).length
  return shared >= REPEATED_WORD_SHARE * words.length
}

export function withoutRepeatedDetails<C extends { text: string }>(entry: Entry<C>): Entry<C> {
  if (entry.kind !== 'claim' || entry.details.length === 0) return entry
  const details = entry.details.filter((detail) => !repeats(detail.text, entry.claim.text))
  return details.length === entry.details.length ? entry : { ...entry, details }
}

export function sectionsInSourceOrder(
  sections: DraftSection[],
  ordinalOf: Map<string, number>,
): DraftSection[] {
  const placeOf = (section: DraftSection) => {
    const points = section.entries.flatMap((entry) => (entry.kind === 'claim' ? [entry.claim] : []))
    const claims = points.length > 0 ? points : section.entries.flatMap(claimsOf)
    return Math.min(
      ...claims.flatMap((claim) => claim.spanIds.map((spanId) => ordinalOf.get(spanId)!)),
    )
  }
  return sections
    .map((section) => ({ section, place: placeOf(section) }))
    .sort((a, b) => a.place - b.place)
    .map(({ section }) => section)
}

export function withoutRepeatsAcrossSections(sections: DraftSection[]): DraftSection[] {
  const claims = sections.flatMap((section, sectionIndex) =>
    section.entries.flatMap((entry) =>
      entry.kind === 'claim'
        ? [entry.claim, ...entry.details].map((claim, index) => ({
            claim,
            sectionIndex,
            isPoint: index === 0,
          }))
        : [],
    ),
  )

  const removed = new Set<DraftClaim>()
  claims.forEach((later, laterIndex) => {
    for (const earlier of claims.slice(0, laterIndex)) {
      if (removed.has(earlier.claim) || removed.has(later.claim)) continue
      if (earlier.sectionIndex === later.sectionIndex) continue
      if (!later.claim.spanIds.some((spanId) => earlier.claim.spanIds.includes(spanId))) continue
      const [kept, repeat] = !earlier.isPoint && later.isPoint ? [later, earlier] : [earlier, later]
      if (repeats(repeat.claim.text, kept.claim.text)) removed.add(repeat.claim)
    }
  })
  if (removed.size === 0) return sections

  return sections
    .map((section) => ({
      heading: section.heading,
      entries: section.entries.flatMap((entry): DraftEntry[] => {
        if (entry.kind !== 'claim') return [entry]
        const details = entry.details.filter((detail) => !removed.has(detail))
        return removed.has(entry.claim)
          ? details.map((detail) => ({ kind: 'claim', claim: detail, details: [] }))
          : [{ kind: 'claim', claim: entry.claim, details }]
      }),
    }))
    .filter((section) => section.entries.length > 0)
}

export function claimsOf<C>(entry: Entry<C>): C[] {
  switch (entry.kind) {
    case 'claim':
      return [entry.claim, ...entry.details]
    case 'steps':
      return entry.steps
    case 'table':
      return entry.rows.flatMap((row) => row.cells.filter((cell) => cell !== null))
  }
}

export function cellStatement(row: string, column: string, cell: string): string {
  return `For ${row}, ${column}: ${cell}`
}

export function statementsOf(sections: DraftSection[]): DraftClaim[] {
  return sections.flatMap((section) =>
    section.entries.flatMap((entry) =>
      entry.kind === 'table'
        ? entry.rows.flatMap((row) =>
            row.cells.flatMap((cell, column) =>
              cell === null
                ? []
                : [{ ...cell, text: cellStatement(row.label, entry.columns[column]!, cell.text) }],
            ),
          )
        : claimsOf(entry),
    ),
  )
}

export function countClaims(sections: Section<unknown>[]): number {
  return sections.reduce(
    (total, section) =>
      total + section.entries.reduce((sum, entry) => sum + claimsOf(entry).length, 0),
    0,
  )
}
