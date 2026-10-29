import { groupEntries, inlineCode, type BlockGroup, type NoteSection } from 'notes-format'

export function notesForClipboard(sections: NoteSection<unknown>[]): {
  text: string
  html: string
} {
  const text: string[] = []
  const html: string[] = []
  for (const section of sections) {
    if (section.heading !== null) {
      text.push(section.heading)
      html.push(`<h2>${inline(section.heading)}</h2>`)
    }
    for (const group of groupEntries(section.blocks)) {
      text.push(blockText(group))
      html.push(blockHtml(group))
    }
  }
  return { text: text.join('\n\n'), html: html.join('') }
}

type Group = BlockGroup<unknown>

function blockText(group: Group): string {
  switch (group.kind) {
    case 'entries':
      return group.entries
        .flatMap((entry) => [
          `- ${entry.line.text}`,
          ...entry.details.map((detail) => `  - ${detail.text}`),
        ])
        .join('\n')
    case 'steps':
      return group.steps.map((step, index) => `${index + 1}. ${step.text}`).join('\n')
    case 'table':
      return group.rows
        .map((row) => {
          const cells = row.cells.flatMap((cell, index) =>
            cell === null ? [] : [`${group.columns[index]}: ${cell.text}`],
          )
          return `- ${row.label}: ${cells.join('; ')}`
        })
        .join('\n')
  }
}

function blockHtml(group: Group): string {
  switch (group.kind) {
    case 'entries':
      return `<ul>${group.entries
        .map(
          (entry) =>
            `<li>${inline(entry.line.text)}${
              entry.details.length > 0
                ? `<ul>${entry.details.map((detail) => `<li>${inline(detail.text)}</li>`).join('')}</ul>`
                : ''
            }</li>`,
        )
        .join('')}</ul>`
    case 'steps':
      return `<ol>${group.steps.map((step) => `<li>${inline(step.text)}</li>`).join('')}</ol>`
    case 'table':
      return `<table><thead><tr><th></th>${group.columns
        .map((column) => `<th>${inline(column)}</th>`)
        .join('')}</tr></thead><tbody>${group.rows
        .map(
          (row) =>
            `<tr><th>${inline(row.label)}</th>${row.cells
              .map((cell) => `<td>${cell === null ? '' : inline(cell.text)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}</tbody></table>`
  }
}

function inline(text: string): string {
  return inlineCode(text)
    .map((segment) =>
      segment.code ? `<code>${escape(segment.text)}</code>` : escape(segment.text),
    )
    .join('')
}

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
