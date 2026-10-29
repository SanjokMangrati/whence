import fontkit from '@pdf-lib/fontkit'
import { groupEntries, inlineCode, splitTerm, type NoteLine } from 'notes-format'
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import hankenMediumData from '../../fonts/HankenGrotesk-Medium.ttf'
import hankenData from '../../fonts/HankenGrotesk-Regular.ttf'
import monoData from '../../fonts/IBMPlexMono-Regular.ttf'
import newsreaderData from '../../fonts/Newsreader-Regular.ttf'
import { ExportError } from '../domain/errors'
import type { ExportDocument, ExportMarker } from './export'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN

const COLOR = {
  ink: hex('#1c1a16'),
  ink2: hex('#45423c'),
  ink3: hex('#6b675f'),
  line: hex('#dedbd6'),
  sourceInk: hex('#014a4f'),
  sourceWash: hex('#e4efee'),
}

interface Fonts {
  serif: PDFFont
  sans: PDFFont
  sansMedium: PDFFont
  mono: PDFFont
}

interface Style {
  font: PDFFont
  size: number
  color: RGB
}

interface Run {
  text: string
  style: Style
  href?: string
  marker?: true
}

interface Piece {
  text: string
  run: Run
  width: number
  gap: number
  breakable: boolean
}

type Line = Piece[]

export async function renderPdf(document: ExportDocument): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(`${document.title} - ${document.kind}`)
  const fonts: Fonts = {
    serif: await pdf.embedFont(newsreaderData, { subset: true }),
    sans: await pdf.embedFont(hankenData, { subset: true }),
    sansMedium: await pdf.embedFont(hankenMediumData, { subset: true }),
    mono: await pdf.embedFont(monoData, { subset: true }),
  }
  const writer = new PageWriter(pdf, fonts)
  const cheatSheet = document.artifactType === 'cheat_sheet'

  writer.paragraph([{ text: document.title, style: writer.style('serif', 24, 'ink') }], {
    lineHeight: 30,
  })
  writer.space(6)
  writer.paragraph(
    [
      {
        text: `${document.kind} · ${document.sourceLabel}`.toUpperCase(),
        style: writer.style('mono', 8, 'ink3'),
      },
    ],
    { lineHeight: 12 },
  )
  writer.paragraph(
    [
      {
        text: document.sourceUrl,
        style: writer.style('sans', 9, 'sourceInk'),
        href: document.sourceUrl,
      },
    ],
    { lineHeight: 14 },
  )
  writer.space(14)
  writer.rule()

  for (const section of document.sections) {
    if (section.heading !== null) {
      writer.space(22)
      writer.keepSpace(80)
      writer.paragraph(writer.textRuns(section.heading, writer.style('serif', 16, 'ink')), {
        lineHeight: 21,
      })
      writer.space(6)
    }
    for (const group of groupEntries(section.blocks)) {
      switch (group.kind) {
        case 'entries':
          for (const entry of group.entries) {
            writer.space(9)
            if (cheatSheet) {
              writer.termRow(entry.line)
            } else {
              writer.paragraph(writer.lineRuns(entry.line, writer.style('serif', 11.5, 'ink')), {
                lineHeight: 17,
              })
              for (const detail of entry.details) {
                writer.space(3)
                writer.paragraph(writer.lineRuns(detail, writer.style('serif', 10.5, 'ink2')), {
                  lineHeight: 15.5,
                  indent: 16,
                  bullet: '–',
                })
              }
            }
            writer.space(9)
            writer.rule()
          }
          break
        case 'steps':
          writer.space(9)
          group.steps.forEach((step, index) => {
            writer.paragraph(writer.lineRuns(step, writer.style('serif', 11, 'ink')), {
              lineHeight: 16.5,
              indent: 20,
              bullet: `${index + 1}.`,
            })
            writer.space(5)
          })
          writer.space(4)
          writer.rule()
          break
        case 'table':
          writer.space(9)
          writer.table(group.columns, group.rows)
          writer.space(9)
          break
      }
    }
  }

  writer.pageNumbers()
  return new Uint8Array(await pdf.save())
}

class PageWriter {
  private page: PDFPage
  private y = PAGE_HEIGHT - MARGIN
  private readonly charsets = new Map<PDFFont, Set<number>>()

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  }

  style(font: keyof Fonts, size: number, color: keyof typeof COLOR): Style {
    return { font: this.fonts[font], size, color: COLOR[color] }
  }

  textRuns(text: string, style: Style): Run[] {
    return inlineCode(text).map((segment) => ({
      text: segment.text,
      style: segment.code ? { ...style, font: this.fonts.mono } : style,
    }))
  }

  lineRuns(line: NoteLine<ExportMarker>, style: Style): Run[] {
    return [...this.textRuns(line.text, style), ...this.markerRuns(line.citations)]
  }

  private markerRuns(markers: ExportMarker[]): Run[] {
    return markers.map((marker) => ({
      text: ` ${marker.label}`,
      style: this.style('mono', 7.5, 'sourceInk'),
      href: marker.href,
      marker: true,
    }))
  }

  space(points: number) {
    this.y -= points
  }

  keepSpace(points: number) {
    if (this.y - points < MARGIN) this.newPage()
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: COLOR.line,
    })
  }

  paragraph(runs: Run[], options: { lineHeight: number; indent?: number; bullet?: string }) {
    const indent = options.indent ?? 0
    const x = MARGIN + indent
    const lines = this.layout(runs, TEXT_WIDTH - indent)
    lines.forEach((line, index) => {
      this.keepSpace(options.lineHeight)
      this.y -= options.lineHeight
      if (index === 0 && options.bullet !== undefined) {
        this.draw(options.bullet, MARGIN, this.y, this.style('mono', 9, 'ink3'))
      }
      this.drawLine(line, x, this.y)
    })
  }

  termRow(line: NoteLine<ExportMarker>) {
    const { term, fact } = splitTerm(line.text)
    const factRuns = [
      ...this.textRuns(fact, this.style('sans', 10, 'ink2')),
      ...this.markerRuns(line.citations),
    ]
    if (term === null) {
      this.paragraph(factRuns, { lineHeight: 15 })
      return
    }
    const termWidth = 150
    const termLines = this.layout(
      this.textRuns(term, this.style('sansMedium', 10, 'ink')),
      termWidth - 12,
    )
    const factLines = this.layout(factRuns, TEXT_WIDTH - termWidth)
    const lineHeight = 15
    this.keepSpace(Math.max(termLines.length, factLines.length) * lineHeight)
    const top = this.y
    termLines.forEach((termLine, index) =>
      this.drawLine(termLine, MARGIN, top - (index + 1) * lineHeight),
    )
    factLines.forEach((factLine, index) =>
      this.drawLine(factLine, MARGIN + termWidth, top - (index + 1) * lineHeight),
    )
    this.y = top - Math.max(termLines.length, factLines.length) * lineHeight
  }

  table(columns: string[], rows: { label: string; cells: (NoteLine<ExportMarker> | null)[] }[]) {
    const columnWidth = TEXT_WIDTH / (columns.length + 1)
    const padding = 6
    const lineHeight = 13.5
    const header = this.style('sansMedium', 8.5, 'ink3')
    const body = this.style('sans', 9.5, 'ink2')

    const drawRow = (cells: Run[][]) => {
      const laidOut = cells.map((runs) => this.layout(runs, columnWidth - 2 * padding))
      const height = Math.max(...laidOut.map((lines) => lines.length)) * lineHeight + 2 * padding
      this.keepSpace(height)
      const top = this.y
      laidOut.forEach((lines, column) =>
        lines.forEach((line, index) =>
          this.drawLine(
            line,
            MARGIN + column * columnWidth + padding,
            top - padding - (index + 1) * lineHeight + 3,
          ),
        ),
      )
      this.y = top - height
      this.rule()
    }

    drawRow([[], ...columns.map((column) => this.textRuns(column, header))])
    for (const row of rows) {
      drawRow([
        this.textRuns(row.label, this.style('sansMedium', 9.5, 'ink')),
        ...row.cells.map((cell) => (cell === null ? [] : this.lineRuns(cell, body))),
      ])
    }
  }

  pageNumbers() {
    const pages = this.pdf.getPages()
    const style = this.style('mono', 8, 'ink3')
    pages.forEach((page, index) => {
      const text = `${index + 1} / ${pages.length}`
      page.drawText(text, {
        x: PAGE_WIDTH - MARGIN - style.font.widthOfTextAtSize(text, style.size),
        y: MARGIN / 2,
        font: style.font,
        size: style.size,
        color: style.color,
      })
    })
  }

  private newPage() {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  private layout(runs: Run[], width: number): Line[] {
    const pieces: Piece[] = []
    let spaced = false
    for (const run of runs) {
      this.requireGlyphs(run)
      const spaceWidth = run.style.font.widthOfTextAtSize(' ', run.style.size)
      for (const [index, word] of run.text.split(' ').entries()) {
        if (index > 0) spaced = true
        if (word === '') continue
        const joinsWord = pieces.length > 0 && !spaced
        for (const part of this.fit(word, run.style, width)) {
          pieces.push({
            text: part,
            run,
            width: run.style.font.widthOfTextAtSize(part, run.style.size),
            gap: spaced ? spaceWidth : 0,
            breakable: run.marker === undefined && !joinsWord,
          })
          spaced = false
        }
      }
    }

    const lines: Line[] = []
    let line: Line = []
    let lineWidth = 0
    for (let index = 0; index < pieces.length;) {
      let end = index + 1
      while (end < pieces.length && !pieces[end]!.breakable) end += 1
      const unit = pieces.slice(index, end)
      const unitWidth = unit.reduce(
        (sum, piece, at) => sum + piece.width + (at > 0 ? piece.gap : 0),
        0,
      )
      const gap = line.length > 0 ? unit[0]!.gap : 0
      if (line.length > 0 && lineWidth + gap + unitWidth > width) {
        lines.push(line)
        line = []
        lineWidth = 0
      }
      line.push(...unit)
      lineWidth += (line.length > unit.length ? gap : 0) + unitWidth
      index = end
    }
    if (line.length > 0) lines.push(line)
    return lines
  }

  private fit(word: string, style: Style, width: number): string[] {
    if (style.font.widthOfTextAtSize(word, style.size) <= width) return [word]
    const parts: string[] = []
    let part = ''
    for (const char of word) {
      if (part !== '' && style.font.widthOfTextAtSize(part + char, style.size) > width) {
        parts.push(part)
        part = ''
      }
      part += char
    }
    if (part !== '') parts.push(part)
    return parts
  }

  private drawLine(line: Line, x: number, y: number) {
    let cursor = x
    line.forEach((piece, index) => {
      if (index > 0) cursor += piece.gap
      if (piece.run.href !== undefined) this.link(piece, cursor, y)
      this.draw(piece.text, cursor, y, piece.run.style)
      cursor += piece.width
    })
  }

  private link(piece: Piece, x: number, y: number) {
    const { size } = piece.run.style
    const href = piece.run.href!
    if (piece.run.marker) {
      this.page.drawRectangle({
        x: x - 1.5,
        y: y - 2.5,
        width: piece.width + 3,
        height: size + 4,
        color: COLOR.sourceWash,
      })
    }
    const annotation = this.pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x - 2, y - 2.5, x + piece.width + 2, y + size + 1.5],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
    })
    this.page.node.addAnnot(this.pdf.context.register(annotation))
  }

  private draw(text: string, x: number, y: number, style: Style) {
    this.page.drawText(text, { x, y, font: style.font, size: style.size, color: style.color })
  }

  private requireGlyphs(run: Run) {
    let charset = this.charsets.get(run.style.font)
    if (charset === undefined) {
      charset = new Set(run.style.font.getCharacterSet())
      this.charsets.set(run.style.font, charset)
    }
    for (const char of run.text) {
      const codePoint = char.codePointAt(0)!
      if (char !== ' ' && !charset.has(codePoint)) {
        throw new ExportError(
          `The PDF fonts have no glyph for U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}.`,
        )
      }
    }
  }
}

function hex(value: string): RGB {
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16) / 255
  return rgb(channel(1), channel(3), channel(5))
}
