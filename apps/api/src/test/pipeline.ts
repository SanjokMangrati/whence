import { env } from 'cloudflare:workers'
import { createDb } from '../db/client'
import type { ClaimVerification, ClaimVerifier } from '../domain/ports'
import type { Concept, OutputType } from '../domain/types'
import { extractFromHtml } from '../providers/readability/article-extractor'
import { getJson, jobStepKey } from '../repositories/blobs'
import { listSpansForSource } from '../repositories/sources'
import { buildCanonicalSource } from '../services/canonical-source'
import { UNBOUNDED_BUDGET } from '../services/spend-budget'
import type { DraftSet } from '../workflows/drafts'
import { checkConcepts } from '../workflows/steps/check-concepts'
import { extractConcepts } from '../workflows/steps/concepts'
import { NO_COUNTS } from '../workflows/metrics'
import { commitGeneration } from '../workflows/steps/commit'
import { generateDrafts } from '../workflows/steps/generate'
import { verifyDrafts } from '../workflows/steps/verify'
import { insertTestJob, insertTestUser } from './factories'
import { fakeGenerator } from './generator'

export const ARTICLE_HTML = `<!doctype html>
<html><head><title>Spaced repetition</title></head>
<body><article>
  <h1>Spaced repetition</h1>
  <p>Recall improves when reviews are spread over time.</p>
  <p>The interval grows after each successful review.</p>
</article></body></html>`

export const CONCEPTS_JSON = JSON.stringify({
  concepts: [
    {
      statement: 'Spreading reviews over time improves recall.',
      role: 'principle',
      topic: 'Spacing',
      spans: [0],
    },
    {
      statement: 'The interval grows after each successful review.',
      role: 'principle',
      topic: 'Spacing',
      spans: [1],
    },
  ],
})

export const NOTES_JSON = JSON.stringify({
  sections: [
    {
      heading: 'Why spacing works',
      entries: [
        { text: 'Spreading reviews over time improves recall.', spans: [0] },
        { text: 'Reviews are best done in one sitting.', spans: [0] },
      ],
    },
  ],
})

export const CHEAT_SHEET_JSON = JSON.stringify({
  sections: [
    {
      heading: 'Review interval',
      entries: [{ text: 'Interval: grows after each successful review', spans: [1] }],
    },
  ],
})

export const QA_JSON = JSON.stringify({
  items: [
    {
      question: 'What happens to the interval after a successful review?',
      answer: 'The interval grows after each successful review.',
      spans: [1],
    },
  ],
})

export function fakeVerifier(
  supports: (claim: string) => boolean,
): ClaimVerifier & { checks: ClaimVerification[] } {
  const checks: ClaimVerification[] = []
  return {
    checks,
    verify: async (input) => {
      checks.push(input)
      return {
        verdict: supports(input.claim) ? 'supported' : 'unsupported',
        probability: supports(input.claim) ? 0.99 : 0.01,
        usage: { inputTokens: 20, outputTokens: 0, costUsd: 0.00001 },
      }
    },
  }
}

export const supportsAll = () => fakeVerifier(() => true)

export async function insertPipelineJob(owner?: string) {
  const db = createDb(env.DB)
  const userId = owner ?? (await insertTestUser(db))
  const url = `https://example.com/post/${crypto.randomUUID()}`
  const { sourceId } = await buildCanonicalSource(db, env.BUCKET, {
    url,
    normalizedUrl: url,
    extracted: extractFromHtml(ARTICLE_HTML, url),
  })
  const jobId = await insertTestJob(db, userId, sourceId)
  const spanIds = (await listSpansForSource(db, sourceId)).map((span) => span.id)
  return { userId, jobId, sourceId, spanIds }
}

export type PipelineJob = Awaited<ReturnType<typeof insertPipelineJob>>

export function readConcepts(jobId: string, step: 'concepts' | 'checked') {
  return getJson<Concept[]>(env.BUCKET, jobStepKey(jobId, step))
}

export async function checkedConcepts(job: PipelineJob, answer = CONCEPTS_JSON) {
  const deps = { db: createDb(env.DB), bucket: env.BUCKET, budget: UNBOUNDED_BUDGET }
  await extractConcepts({ ...deps, generator: fakeGenerator([answer]) }, job)
  await checkConcepts({ ...deps, generator: fakeGenerator([]), verifier: supportsAll() }, job)
}

export async function draftsFrom(
  job: PipelineJob,
  answers: string[],
  outputType: OutputType = 'notes',
) {
  await checkedConcepts(job)
  await generateDrafts(
    { db: createDb(env.DB), bucket: env.BUCKET, generator: fakeGenerator(answers) },
    { ...job, outputType },
  )
}

export async function committedPipelineJob(owner?: string) {
  return commitPipelineJob(await insertPipelineJob(owner))
}

export async function commitPipelineJob(job: PipelineJob) {
  const db = createDb(env.DB)
  await draftsFrom(job, [NOTES_JSON, QA_JSON])
  await verifyDrafts(
    {
      db,
      bucket: env.BUCKET,
      generator: fakeGenerator([]),
      verifier: supportsAll(),
      budget: UNBOUNDED_BUDGET,
    },
    job,
  )
  const committed = await commitGeneration(
    { db, bucket: env.BUCKET },
    {
      ...job,
      configuredModelId: 'test-model',
      measures: {
        modelId: 'test-model',
        usage: { inputTokens: 300, outputTokens: 150, costUsd: 0.003 },
        stageDurationsMs: {},
        counts: NO_COUNTS,
      },
    },
  )
  return { ...job, ...committed }
}

export function readDrafts(jobId: string, step: 'drafts' | 'verified') {
  return getJson<DraftSet>(env.BUCKET, jobStepKey(jobId, step))
}
