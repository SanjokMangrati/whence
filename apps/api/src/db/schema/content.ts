import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import type { SourceType, SpanKind } from '../../domain/types'

export const source = sqliteTable(
  'source',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    sourceType: text('source_type').$type<SourceType>().notNull(),
    contentHash: text('content_hash').notNull(),
    title: text('title'),
    channel: text('channel'),
    lengthMs: integer('length_ms'),
    r2Key: text('r2_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [unique().on(table.normalizedUrl, table.contentHash)],
)

export const sourceSpan = sqliteTable(
  'source_span',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').$type<SpanKind>().notNull().default('text'),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    textHash: text('text_hash').notNull(),
  },
  (table) => [unique().on(table.sourceId, table.ordinal)],
)
