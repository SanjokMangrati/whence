import { isNull } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Plan } from 'entitlements'
import { user } from './auth'
import { generationJob } from './generation'

export const subscription = sqliteTable('subscription', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id),
  tier: text('tier').$type<Plan>().notNull().default('free'),
  status: text('status', { enum: ['active', 'canceled', 'past_due'] })
    .notNull()
    .default('active'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).notNull().default(false),
  lastEventAt: integer('last_event_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const usageRecord = sqliteTable(
  'usage_record',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    period: text('period').notNull(),
    slot: integer('slot').notNull(),
    jobId: text('job_id')
      .notNull()
      .unique()
      .references(() => generationJob.id),
    returnedAt: integer('returned_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('usage_record_user_period_idx').on(table.userId, table.period),
    uniqueIndex('usage_record_open_slot_idx')
      .on(table.userId, table.period, table.slot)
      .where(isNull(table.returnedAt)),
  ],
)

export const demoBudget = sqliteTable('demo_budget', {
  period: text('period').primaryKey(),
  transcriptCreditsLeft: integer('transcript_credits_left').notNull(),
  verifierMicroUsdLeft: integer('verifier_micro_usd_left').notNull(),
})

export const webhookEvent = sqliteTable('webhook_event', {
  id: text('id').primaryKey(),
  providerEventId: text('provider_event_id').notNull().unique(),
  type: text('type').notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  payloadR2Key: text('payload_r2_key').notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
