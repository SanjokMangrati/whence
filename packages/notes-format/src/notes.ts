export interface NoteLine<C> {
  text: string
  citations: C[]
}

export type NoteBlock<C> =
  | { kind: 'entry'; line: NoteLine<C>; details: NoteLine<C>[] }
  | { kind: 'steps'; steps: NoteLine<C>[] }
  | { kind: 'table'; columns: string[]; rows: { label: string; cells: (NoteLine<C> | null)[] }[] }

export interface NoteSection<C> {
  heading: string | null
  blocks: NoteBlock<C>[]
}

const MARKER = /\[\^(\d+)\]/g
const STEP = /^(\d+)\. /
const CELL_SEPARATOR = /(?<!\\)\|/

export function parseNotes<C>(
  markdown: string,
  citationAt: (ordinal: number) => C,
): NoteSection<C>[] {
  const toLine = (text: string): NoteLine<C> => ({
    text: text.replace(MARKER, '').trim(),
    citations: [...text.matchAll(MARKER)].map((match) => citationAt(Number(match[1]) - 1)),
  })

  const sections: NoteSection<C>[] = [{ heading: null, blocks: [] }]
  let tableRows: string[][] = []

  const endTable = () => {
    if (tableRows.length === 0) return
    const [header = [], , ...body] = tableRows
    sections.at(-1)!.blocks.push({
      kind: 'table',
      columns: header.slice(1),
      rows: body.map(([label = '', ...cells]) => ({
        label,
        cells: cells.map((cell) => (cell === '' ? null : toLine(cell))),
      })),
    })
    tableRows = []
  }

  for (const line of markdown.split('\n')) {
    if (line.startsWith('|')) {
      tableRows.push(
        line
          .trim()
          .slice(1, -1)
          .split(CELL_SEPARATOR)
          .map((cell) => cell.trim().replaceAll('\\|', '|')),
      )
      continue
    }
    endTable()

    const blocks = sections.at(-1)!.blocks
    const last = blocks.at(-1)
    const step = STEP.exec(line)
    if (line.startsWith('## ')) {
      sections.push({ heading: line.slice(3).trim(), blocks: [] })
    } else if (line.startsWith('  - ') && last?.kind === 'entry') {
      last.details.push(toLine(line.slice(4)))
    } else if (line.startsWith('- ')) {
      blocks.push({ kind: 'entry', line: toLine(line.slice(2)), details: [] })
    } else if (step !== null) {
      const text = toLine(line.slice(step[0].length))
      if (step[1] !== '1' && last?.kind === 'steps') last.steps.push(text)
      else blocks.push({ kind: 'steps', steps: [text] })
    }
  }
  endTable()

  return sections.filter((section) => section.blocks.length > 0)
}

export function splitTerm(text: string): { term: string | null; fact: string } {
  let start = 0
  for (const segment of inlineCode(text)) {
    const colon = segment.code ? -1 : segment.text.indexOf(': ')
    if (colon !== -1) {
      return { term: text.slice(0, start + colon), fact: text.slice(start + colon + 2) }
    }
    start += segment.code ? segment.text.length + 2 : segment.text.length
  }
  return { term: null, fact: text }
}

export interface TextSegment {
  text: string
  code: boolean
}

const INLINE_CODE = /`([^`\n]+)`/

export function inlineCode(text: string): TextSegment[] {
  return text
    .split(INLINE_CODE)
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter((segment) => segment.text !== '')
}

export type BlockGroup<C> =
  | Exclude<NoteBlock<C>, { kind: 'entry' }>
  | { kind: 'entries'; entries: Extract<NoteBlock<C>, { kind: 'entry' }>[] }

export function groupEntries<C>(blocks: NoteBlock<C>[]): BlockGroup<C>[] {
  const groups: BlockGroup<C>[] = []
  for (const block of blocks) {
    const last = groups.at(-1)
    if (block.kind !== 'entry') groups.push(block)
    else if (last?.kind === 'entries') last.entries.push(block)
    else groups.push({ kind: 'entries', entries: [block] })
  }
  return groups
}

export function linesOf<C>(block: NoteBlock<C>): NoteLine<C>[] {
  switch (block.kind) {
    case 'entry':
      return [block.line, ...block.details]
    case 'steps':
      return block.steps
    case 'table':
      return block.rows.flatMap((row) => row.cells.filter((cell) => cell !== null))
  }
}

export function questionsFor<Q extends { spanIds: string[] }>(
  section: NoteSection<{ spanId: string }>,
  questions: Q[],
): Q[] {
  const cited = new Set(
    section.blocks.flatMap((block) =>
      linesOf(block).flatMap((line) => line.citations.map((citation) => citation.spanId)),
    ),
  )
  return questions.filter((question) => question.spanIds.some((spanId) => cited.has(spanId)))
}
