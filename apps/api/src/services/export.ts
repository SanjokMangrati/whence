import {
  groupAdjacent,
  hostName,
  markerLabel,
  parseNotes,
  sourceLabel,
  type NoteLine,
  type NoteSection,
} from 'notes-format'
import type { ArtifactType } from '../domain/types'
import {
  readArtifact,
  type ArtifactView,
  type CitationAnchor,
  type ReaderDeps,
} from './artifact-reader'
import { renderDocx } from './export-docx'
import { renderMarkdown } from './export-markdown'
import { requireEntitlement, resolvePlan } from './plans'

export type ExportFormat = 'docx' | 'md'

export interface ExportMarker {
  label: string
  href: string
}

export interface ExportDocument {
  title: string
  artifactType: ArtifactType
  kind: string
  sourceLabel: string
  sourceUrl: string
  sections: NoteSection<ExportMarker>[]
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
}

const RENDER: Record<ExportFormat, (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>>> =
  {
    docx: renderDocx,
    md: async (document) => renderMarkdown(document),
  }

const KIND_LABEL: Record<ArtifactType, string> = {
  notes: 'Notes',
  cheat_sheet: 'Cheat sheet',
}

const MAX_FILE_TITLE_LENGTH = 80

export async function exportArtifact(
  deps: ReaderDeps,
  userId: string,
  artifactId: string,
  format: ExportFormat,
) {
  requireEntitlement(await resolvePlan(deps.db, userId), 'export')
  const view = await readArtifact(deps, userId, artifactId)
  if (view === null) return null

  const document = toExportDocument(view)
  return {
    bytes: await RENDER[format](document),
    contentType: CONTENT_TYPE[format],
    filename: `${fileTitle(document.title)} - ${document.kind}.${format}`,
  }
}

function toExportDocument(view: ArtifactView): ExportDocument {
  const byOrdinal = new Map(view.citations.map((citation) => [citation.ordinal, citation]))
  const sections = parseNotes(view.markdown, (ordinal) => {
    const citation = byOrdinal.get(ordinal)
    if (citation === undefined) {
      throw new Error(`Artifact ${view.id} has marker ${ordinal + 1} with no citation.`)
    }
    return citation
  })
  const url = view.source.url
  const toLine = (line: NoteLine<CitationAnchor>): NoteLine<ExportMarker> => ({
    text: line.text,
    citations: groupAdjacent(line.citations).map((group) => ({
      label: markerLabel(group[0]!),
      href: sourceHref(url, group[0]!),
    })),
  })

  return {
    title: view.source.title ?? hostName(url),
    artifactType: view.artifactType,
    kind: KIND_LABEL[view.artifactType],
    sourceLabel: sourceLabel(view.source.sourceType, url),
    sourceUrl: url,
    sections: sections.map((section) => ({
      heading: section.heading,
      blocks: section.blocks.map((block) => {
        switch (block.kind) {
          case 'entry':
            return { kind: 'entry', line: toLine(block.line), details: block.details.map(toLine) }
          case 'steps':
            return { kind: 'steps', steps: block.steps.map(toLine) }
          case 'table':
            return {
              kind: 'table',
              columns: block.columns,
              rows: block.rows.map((row) => ({
                label: row.label,
                cells: row.cells.map((cell) => (cell === null ? null : toLine(cell))),
              })),
            }
        }
      }),
    })),
  }
}

function sourceHref(url: string, first: CitationAnchor) {
  if (first.startMs === null) return url
  const link = new URL(url)
  link.searchParams.set('t', `${Math.floor(first.startMs / 1000)}s`)
  return link.toString()
}

function fileTitle(title: string) {
  const clean = title
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.slice(0, MAX_FILE_TITLE_LENGTH).trim() || 'Source'
}
