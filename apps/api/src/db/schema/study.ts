import { integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { user } from './auth'
import { qaItem } from './generation'

export const reviewSchedule = sqliteTable(
  'review_schedule',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    qaItemId: text('qa_item_id')
      .notNull()
      .references(() => qaItem.id),
    easeFactor: real('ease_factor').notNull().default(2.5),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
    lastRatedAt: integer('last_rated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [unique().on(table.userId, table.qaItemId)],
)

export const reminderSetting = sqliteTable('reminder_setting', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  lastSentOn: text('last_sent_on'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
