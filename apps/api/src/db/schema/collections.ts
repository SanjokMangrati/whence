import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { user } from './auth'
import { artifact } from './generation'

export const collection = sqliteTable(
  'collection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('collection_user_id_idx').on(table.userId)],
)

export const collectionItem = sqliteTable(
  'collection_item',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collection.id),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifact.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    unique().on(table.collectionId, table.artifactId),
    index('collection_item_artifact_id_idx').on(table.artifactId),
  ],
)
