export function timestamp(ms: number): string {
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

export function hostName(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

export function sourceLabel(sourceType: 'video' | 'article', url: string): string {
  return sourceType === 'video' ? 'YouTube video' : `Article from ${hostName(url)}`
}

export interface Anchor {
  spanOrdinal: number
  startMs: number | null
  endMs: number | null
}

export function groupAdjacent<T extends Anchor>(citations: T[]): T[][] {
  const groups: T[][] = []
  for (const citation of [...citations].sort((a, b) => a.spanOrdinal - b.spanOrdinal)) {
    const group = groups.at(-1)
    const last = group?.at(-1)
    if (group !== undefined && last !== undefined && citation.spanOrdinal <= last.spanOrdinal + 1) {
      if (citation.spanOrdinal > last.spanOrdinal) group.push(citation)
      continue
    }
    groups.push([citation])
  }
  return groups
}

export function markerLabel(first: Anchor): string {
  return first.startMs !== null ? timestamp(first.startMs) : `¶ ${first.spanOrdinal + 1}`
}

export function passageLabel(first: Anchor, last: Anchor): string {
  if (first.startMs !== null) {
    const endMs = last.endMs ?? last.startMs
    return first === last || endMs === null
      ? timestamp(first.startMs)
      : `${timestamp(first.startMs)}–${timestamp(endMs)}`
  }
  return first === last
    ? `${first.spanOrdinal + 1}`
    : `${first.spanOrdinal + 1}–${last.spanOrdinal + 1}`
}
