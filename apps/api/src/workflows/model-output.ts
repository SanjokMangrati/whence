import { DomainError } from '../domain/errors'
import type { ConceptRole } from '../domain/types'
import { MIN_MAPPING_ROWS, type Entry, type Section } from './drafts'

export interface RawClaim {
  text: string
  spans: number[]
}

export interface RawConcept {
  statement: string
  role: ConceptRole
  topic: string
  shows: number[]
  spans: number[]
}

export interface RawQaItem {
  question: string
  answer: string
  spans: number[]
}

export interface RawRewrite {
  id: number
  statement: string | null
}

const CONCEPT_ROLES: readonly ConceptRole[] = [
  'principle',
  'worked_example',
  'example',
  'analogy',
  'aside',
]

export function parseConcepts(text: string): RawConcept[] {
  return listIn(parseObject(text), 'concepts').map((entry) => ({
    statement: field(entry, 'statement'),
    role: role(entry),
    topic: field(entry, 'topic'),
    shows: positions(entry),
    spans: ordinals(entry),
  }))
}

export function parseRewrites(
  text: string,
  list: 'concepts' | 'steps' | 'statements',
  count: number,
): RawRewrite[] {
  const seen = new Set<unknown>()
  return listIn(parseObject(text), list).map((entry) => {
    const id = entry.id
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= count || seen.has(id)) {
      throw new DomainError('generation_failed', `"${String(id)}" is not an id in "${list}".`)
    }
    seen.add(id)
    return { id, statement: entry.statement === null ? null : field(entry, 'statement') }
  })
}

export function parseSections(text: string): Section<RawClaim>[] {
  return listIn(parseObject(text), 'sections').map((section) => ({
    heading: field(section, 'heading'),
    entries: listIn(section, 'entries').flatMap(toEntries),
  }))
}

export function parseQaItems(text: string): RawQaItem[] {
  return listIn(parseObject(text), 'items').map((entry) => ({
    question: field(entry, 'question'),
    answer: field(entry, 'answer'),
    spans: ordinals(entry),
  }))
}

export function toSpanIds(
  cited: number[],
  spanIdByOrdinal: Map<number, string>,
): { spanIds: string[]; invalidSpans?: number[] } {
  const invalidSpans = cited.filter((ordinal) => !spanIdByOrdinal.has(ordinal))
  if (invalidSpans.length > 0) return { spanIds: [], invalidSpans }
  return { spanIds: [...new Set(cited.map((ordinal) => spanIdByOrdinal.get(ordinal)!))] }
}

function toClaim(entry: Record<string, unknown>): RawClaim {
  return { text: field(entry, 'text'), spans: ordinals(entry) }
}

function toEntries(entry: Record<string, unknown>): Entry<RawClaim>[] {
  if (entry.table !== undefined) {
    return toTable(entry.table)
  }
  if (entry.steps !== undefined) {
    return [{ kind: 'steps', steps: listIn(entry, 'steps').map(toClaim) }]
  }
  return [
    {
      kind: 'claim',
      claim: toClaim(entry),
      details: entry.details === undefined ? [] : listIn(entry, 'details').map(toClaim),
    },
  ]
}

function toTable(value: unknown): Entry<RawClaim>[] {
  const table = asRecord(value, 'table')
  const columns = table.columns
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new DomainError('generation_failed', 'A table has no "columns" list.')
  }
  const names = columns.map((column) => {
    if (typeof column !== 'string' || column.trim() === '') {
      throw new DomainError('generation_failed', 'A table column has no name.')
    }
    return column.trim()
  })
  const rawRows = listIn(table, 'rows')
  const cellLists = rawRows.map((row) => {
    if (!Array.isArray(row.cells)) {
      throw new DomainError('generation_failed', 'A table row has no "cells" list.')
    }
    return row.cells as unknown[]
  })
  const hasLabelColumn =
    names.length > 1 && cellLists.every((cells) => cells.length === names.length - 1)
  const attributes = hasLabelColumn ? names.slice(1) : names
  const rows = rawRows.map((row, index) => {
    const cells = cellLists[index]!
    if (cells.length !== attributes.length) {
      throw new DomainError('generation_failed', 'A table row does not have one cell per column.')
    }
    return {
      label: field(row, 'label'),
      cells: cells.map((cell) => (cell === null ? null : toClaim(asRecord(cell, 'cell')))),
    }
  })
  const stated = rows.filter((row) => row.cells[0] !== null).length
  if (attributes.length === 1 && stated < MIN_MAPPING_ROWS) {
    return rows.flatMap((row) => {
      const cell = row.cells[0]
      return cell === null || cell === undefined
        ? []
        : [{ kind: 'claim', claim: { ...cell, text: `${row.label}: ${cell.text}` }, details: [] }]
    })
  }
  return [{ kind: 'table', columns: attributes, rows }]
}

function parseObject(text: string): Record<string, unknown> {
  const root = parseJson(text)
  if (!isRecord(root)) {
    throw new DomainError(
      'generation_failed',
      'The model answered with a JSON value, not an object.',
    )
  }
  return root
}

function listIn(parent: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const list = parent[key]
  if (!Array.isArray(list)) {
    throw new DomainError('generation_failed', `The model answer has no "${key}" array.`)
  }
  return list.map((entry) => {
    if (!isRecord(entry)) {
      throw new DomainError('generation_failed', `An entry in "${key}" is not an object.`)
    }
    return entry
  })
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DomainError('generation_failed', `A "${name}" is not an object.`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  try {
    return JSON.parse((fenced === null ? text : fenced[1]!).trim())
  } catch {
    throw new DomainError('generation_failed', 'The model did not answer with JSON.')
  }
}

function field(entry: Record<string, unknown>, name: string): string {
  const value = entry[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('generation_failed', `An entry has no "${name}" text.`)
  }
  return value.trim()
}

function role(entry: Record<string, unknown>): ConceptRole {
  const value = entry.role
  if (!CONCEPT_ROLES.includes(value as ConceptRole)) {
    throw new DomainError('generation_failed', `"${String(value)}" is not a concept role.`)
  }
  return value as ConceptRole
}

function positions(entry: Record<string, unknown>): number[] {
  const value = entry.shows ?? []
  if (!Array.isArray(value)) {
    throw new DomainError('generation_failed', '"shows" is not a list.')
  }
  return value.map((position) => {
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
      throw new DomainError('generation_failed', `"${String(position)}" is not a concept number.`)
    }
    return position
  })
}

function ordinals(entry: Record<string, unknown>): number[] {
  const value = entry.spans
  if (!Array.isArray(value) || value.length === 0) {
    throw new DomainError('generation_failed', 'An entry cites no span.')
  }
  return value.map((ordinal) => {
    if (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal < 0) {
      throw new DomainError('generation_failed', `"${String(ordinal)}" is not a span number.`)
    }
    return ordinal
  })
}
