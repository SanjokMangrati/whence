import { groupEntries, inlineCode, splitTerm, type NoteLine } from 'notes-format'
import type { ExportDocument, ExportMarker } from './export'

const MARKDOWN_SPECIAL = /[\\`*_[\]<>|]/g

export function renderMarkdown(document: ExportDocument): Uint8Array<ArrayBuffer> {
  const cheatSheet = document.artifactType === 'cheat_sheet'
  const blocks: string[] = [
    `# ${text(document.title)}`,
    `${document.kind} · [${text(document.sourceLabel)}](${href(document.sourceUrl)})`,
  ]

  for (const section of document.sections) {
    if (section.heading !== null) blocks.push(`## ${text(section.heading)}`)
    for (const group of groupEntries(section.blocks)) {
      switch (group.kind) {
        case 'entries':
          blocks.push(
            group.entries
              .flatMap((entry) => [
                `- ${cheatSheet ? termLine(entry.line) : line(entry.line)}`,
                ...entry.details.map((detail) => `  - ${line(detail)}`),
              ])
              .join('\n'),
          )
          break
        case 'steps':
          blocks.push(group.steps.map((step, index) => `${index + 1}. ${line(step)}`).join('\n'))
          break
        case 'table':
          blocks.push(
            [
              row(['', ...group.columns.map(text)]),
              row(['', ...group.columns].map(() => '---')),
              ...group.rows.map((tableRow) =>
                row([
                  text(tableRow.label),
                  ...tableRow.cells.map((cell) => (cell === null ? '' : line(cell))),
                ]),
              ),
            ].join('\n'),
          )
          break
      }
    }
  }

  return new Uint8Array(new TextEncoder().encode(`${blocks.join('\n\n')}\n`))
}

function text(value: string) {
  return inlineCode(value)
    .map((segment) =>
      segment.code ? `\`${segment.text}\`` : segment.text.replace(MARKDOWN_SPECIAL, '\\$&'),
    )
    .join('')
}

function line(value: NoteLine<ExportMarker>) {
  return [text(value.text), ...value.citations.map(marker)].join(' ')
}

function termLine(value: NoteLine<ExportMarker>) {
  const { term, fact } = splitTerm(value.text)
  const body = term === null ? text(fact) : `**${text(term)}**: ${text(fact)}`
  return [body, ...value.citations.map(marker)].join(' ')
}

function marker(value: ExportMarker) {
  return `[${value.label}](${href(value.href)})`
}

function href(url: string) {
  return url.replaceAll('(', '%28').replaceAll(')', '%29')
}

function row(cells: string[]) {
  return `| ${cells.join(' | ')} |`
}
