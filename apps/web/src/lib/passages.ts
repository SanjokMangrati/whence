import { groupAdjacent, passageLabel, type Anchor } from 'notes-format'

export interface Passage {
  key: string
  spanIds: string[]
  first: Anchor
  last: Anchor
}

type Cited = Anchor & { id: string; spanId: string }

export function toPassages(citations: Cited[]): Passage[] {
  return groupAdjacent(citations).map(toPassage)
}

export function toPassage(group: Cited[]): Passage {
  return {
    key: group[0]!.id,
    spanIds: group.map((citation) => citation.spanId),
    first: group[0]!,
    last: group.at(-1)!,
  }
}

export function chipDescription(passage: Passage): string {
  const label = passageLabel(passage.first, passage.last).replace('–', ' to ')
  if (passage.first.startMs !== null) return `Play from ${label}`
  return passage.first === passage.last ? `Show paragraph ${label}` : `Show paragraphs ${label}`
}
