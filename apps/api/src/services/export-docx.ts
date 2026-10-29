import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'
import { groupEntries, inlineCode, splitTerm, type NoteLine } from 'notes-format'
import type { ExportDocument, ExportMarker } from './export'

const SERIF = 'Georgia'
const MONO = 'Consolas'

const INK = '1c1a16'
const INK_2 = '45423c'
const INK_3 = '6b675f'
const LINE = 'dedbd6'
const SOURCE_INK = '014a4f'

const BODY = 22
const DETAIL = 20
const MARKER = 15

const STEPS = 'steps'

export async function renderDocx(document: ExportDocument): Promise<Uint8Array<ArrayBuffer>> {
  const cheatSheet = document.artifactType === 'cheat_sheet'
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: document.title, font: SERIF, size: 48, color: INK })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${document.kind} · ${document.sourceLabel}`.toUpperCase(),
          font: MONO,
          size: 16,
          color: INK_3,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new ExternalHyperlink({
          link: document.sourceUrl,
          children: [new TextRun({ text: document.sourceUrl, size: 18, color: SOURCE_INK })],
        }),
      ],
    }),
  ]

  let stepsInstance = 0
  for (const section of document.sections) {
    if (section.heading !== null) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 120 },
          children: textRuns(section.heading, { font: SERIF, size: 32, color: INK }),
        }),
      )
    }
    for (const group of groupEntries(section.blocks)) {
      switch (group.kind) {
        case 'entries':
          for (const entry of group.entries) {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 120 },
                children: cheatSheet
                  ? termRuns(entry.line)
                  : lineRuns(entry.line, { font: SERIF, size: BODY, color: INK }),
              }),
              ...entry.details.map(
                (detail) =>
                  new Paragraph({
                    bullet: { level: 1 },
                    children: lineRuns(detail, { font: SERIF, size: DETAIL, color: INK_2 }),
                  }),
              ),
            )
          }
          break
        case 'steps':
          stepsInstance += 1
          children.push(
            ...group.steps.map(
              (step) =>
                new Paragraph({
                  numbering: { reference: STEPS, level: 0, instance: stepsInstance },
                  spacing: { before: 80 },
                  children: lineRuns(step, { font: SERIF, size: BODY, color: INK }),
                }),
            ),
          )
          break
        case 'table':
          children.push(table(group.columns, group.rows), new Paragraph({}))
          break
      }
    }
  }

  const file = new Document({
    title: `${document.title} - ${document.kind}`,
    numbering: {
      config: [
        {
          reference: STEPS,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              style: { paragraph: { indent: { left: 440, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  })
  return new Uint8Array(await Packer.toArrayBuffer(file))
}

interface RunStyle {
  font: string
  size: number
  color: string
  bold?: boolean
}

function textRuns(text: string, style: RunStyle): TextRun[] {
  return inlineCode(text).map(
    (segment) => new TextRun({ text: segment.text, ...style, ...(segment.code && { font: MONO }) }),
  )
}

function lineRuns(line: NoteLine<ExportMarker>, style: RunStyle): ParagraphChild[] {
  return [...textRuns(line.text, style), ...markerRuns(line.citations)]
}

function termRuns(line: NoteLine<ExportMarker>): ParagraphChild[] {
  const { term, fact } = splitTerm(line.text)
  return [
    ...(term === null
      ? []
      : [
          ...textRuns(term, { font: SERIF, size: BODY, color: INK, bold: true }),
          new TextRun({ text: ': ', font: SERIF, size: BODY, color: INK, bold: true }),
        ]),
    ...textRuns(fact, { font: SERIF, size: BODY, color: INK_2 }),
    ...markerRuns(line.citations),
  ]
}

function markerRuns(markers: ExportMarker[]): ParagraphChild[] {
  return markers.flatMap((marker) => [
    new TextRun({ text: ' ', size: MARKER }),
    new ExternalHyperlink({
      link: marker.href,
      children: [
        new TextRun({
          text: marker.label,
          font: MONO,
          size: MARKER,
          color: SOURCE_INK,
          shading: { fill: 'e4efee' },
        }),
      ],
    }),
  ])
}

function table(
  columns: string[],
  rows: { label: string; cells: (NoteLine<ExportMarker> | null)[] }[],
): Table {
  const hairline = { style: BorderStyle.SINGLE, size: 4, color: LINE }
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' }
  const cell = (children: ParagraphChild[]) =>
    new TableCell({
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children })],
    })
  const text = (value: string, style: Partial<RunStyle> = {}) =>
    textRuns(value, { font: SERIF, size: DETAIL, color: INK_2, ...style })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: hairline,
      bottom: hairline,
      insideHorizontal: hairline,
      left: none,
      right: none,
      insideVertical: none,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([]),
          ...columns.map((column) => cell(text(column, { color: INK_3, bold: true }))),
        ],
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: [
              cell(text(row.label, { color: INK, bold: true })),
              ...row.cells.map((value) =>
                cell(
                  value === null
                    ? []
                    : lineRuns(value, { font: SERIF, size: DETAIL, color: INK_2 }),
                ),
              ),
            ],
          }),
      ),
    ],
  })
}
