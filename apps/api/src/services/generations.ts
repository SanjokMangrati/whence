import type { Database } from '../db/client'
import { sourceTypeOf } from '../domain/source-url'
import { listArtifactsForUserJob, listNotesEntryCountsForUser } from '../repositories/artifacts'
import { deleteGenerationJobForUser } from '../repositories/generation-delete'
import {
  findGenerationJobForUser,
  listGenerationJobsForUser,
} from '../repositories/generation-jobs'
import { countQaItemsByJobForUser } from '../repositories/qa-items'
import { listNextReviewsByJobForUser } from '../repositories/review-schedules'
import { findSourceById } from '../repositories/sources'
import { hasOpenUsageRecordForJob } from '../repositories/usage-records'

export async function listGenerations(db: Database, userId: string) {
  const [rows, notes, questions, reviews] = await Promise.all([
    listGenerationJobsForUser(db, userId),
    listNotesEntryCountsForUser(db, userId),
    countQaItemsByJobForUser(db, userId),
    listNextReviewsByJobForUser(db, userId),
  ])
  const notesByJob = new Map(notes.map((row) => [row.jobId, row.entryCount]))
  const questionsByJob = new Map(questions.map((row) => [row.jobId, row.questions]))
  const nextReviewByJob = new Map(reviews.map((row) => [row.jobId, row.dueAt]))
  return rows.map((row) => ({
    id: row.id,
    requestedUrl: row.requestedUrl,
    outputType: row.outputType,
    status: row.status,
    stage: row.stage,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    sourceType: row.sourceType ?? sourceTypeOf(row.requestedUrl),
    source: row.sourceType === null ? null : { title: row.sourceTitle, channel: row.sourceChannel },
    notes: notesByJob.get(row.id) ?? null,
    questions: questionsByJob.get(row.id) ?? 0,
    nextReviewAt: nextReviewByJob.get(row.id) ?? null,
  }))
}

export async function readGenerationStatus(db: Database, userId: string, jobId: string) {
  const job = await findGenerationJobForUser(db, userId, jobId)
  if (job === undefined) return null

  const [artifacts, source, counted] = await Promise.all([
    listArtifactsForUserJob(db, userId, job.id),
    job.sourceId === null ? undefined : findSourceById(db, job.sourceId),
    job.status === 'failed' ? hasOpenUsageRecordForJob(db, job.id) : true,
  ])
  return {
    id: job.id,
    requestedUrl: job.requestedUrl,
    outputType: job.outputType,
    sourceType: source?.sourceType ?? sourceTypeOf(job.requestedUrl),
    title: source?.title ?? null,
    status: job.status,
    stage: job.stage,
    errorCode: job.errorCode,
    countsTowardQuota: counted,
    artifacts: artifacts.map((row) => ({ id: row.id, artifactType: row.artifactType })),
  }
}

export async function deleteGeneration(db: Database, userId: string, jobId: string) {
  return deleteGenerationJobForUser(db, userId, jobId, new Date())
}
