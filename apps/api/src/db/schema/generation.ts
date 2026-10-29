import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import type { ArtifactType, OutputType } from '../../domain/types'
import { user } from './auth'
import { source, sourceSpan } from './content'

export const generationJob = sqliteTable(
  'generation_job',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    sourceId: text('source_id').references(() => source.id),
    requestedUrl: text('requested_url').notNull(),
    outputType: text('output_type').$type<OutputType>().notNull(),
    status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] })
      .notNull()
      .default('queued'),
    stage: text('stage', {
      enum: [
        'validate',
        'cache_check',
        'extract',
        'extract_concepts',
        'check_concepts',
        'generate',
        'verify',
        'commit',
      ],
    }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    workflowInstanceId: text('workflow_instance_id').notNull().unique(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('generation_job_user_id_idx').on(table.userId),
    index('generation_job_created_at_idx').on(table.createdAt),
  ],
)

export const artifact = sqliteTable(
  'artifact',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    jobId: text('job_id')
      .notNull()
      .references(() => generationJob.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id),
    artifactType: text('artifact_type').$type<ArtifactType>().notNull(),
    promptVersion: text('prompt_version').notNull(),
    modelId: text('model_id').notNull(),
    contentR2Key: text('content_r2_key').notNull(),
    entryCount: integer('entry_count').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('artifact_user_id_idx').on(table.userId),
    index('artifact_job_id_idx').on(table.jobId),
  ],
)

export const qaItem = sqliteTable(
  'qa_item',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    jobId: text('job_id')
      .notNull()
      .references(() => generationJob.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    promptVersion: text('prompt_version').notNull(),
    modelId: text('model_id').notNull(),
    removedAt: integer('removed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('qa_item_user_id_idx').on(table.userId),
    index('qa_item_job_id_idx').on(table.jobId),
  ],
)

export const citation = sqliteTable(
  'citation',
  {
    id: text('id').primaryKey(),
    ownerType: text('owner_type', { enum: ['artifact', 'qa_item'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    spanId: text('span_id')
      .notNull()
      .references(() => sourceSpan.id),
    ordinal: integer('ordinal').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('citation_owner_idx').on(table.ownerType, table.ownerId)],
)

export const artifactCache = sqliteTable(
  'artifact_cache',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id),
    contentHash: text('content_hash').notNull(),
    outputType: text('output_type', { enum: ['notes', 'cheat_sheet', 'qa'] }).notNull(),
    promptVersion: text('prompt_version').notNull(),
    modelId: text('model_id').notNull(),
    canonicalJobId: text('canonical_job_id')
      .notNull()
      .references(() => generationJob.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    unique().on(
      table.sourceId,
      table.contentHash,
      table.outputType,
      table.promptVersion,
      table.modelId,
    ),
  ],
)

export const generationMetric = sqliteTable('generation_metric', {
  id: text('id').primaryKey(),
  jobId: text('job_id')
    .notNull()
    .unique()
    .references(() => generationJob.id),
  modelId: text('model_id').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
  stageDurationsMs: text('stage_durations_ms').notNull(),
  failureStage: text('failure_stage'),
  claimsGenerated: integer('claims_generated').notNull(),
  claimsRejected: integer('claims_rejected').notNull(),
  claimsRewritten: integer('claims_rewritten').notNull().default(0),
  conceptsUnsupported: integer('concepts_unsupported').notNull().default(0),
  conceptsRewritten: integer('concepts_rewritten').notNull().default(0),
  stepsUnsupported: integer('steps_unsupported').notNull().default(0),
  stepsRewritten: integer('steps_rewritten').notNull().default(0),
  citationsInvalid: integer('citations_invalid').notNull().default(0),
  verifierCalls: integer('verifier_calls').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const providerKey = sqliteTable('provider_key', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  last4: text('last4').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
