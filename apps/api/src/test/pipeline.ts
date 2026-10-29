import { env } from 'cloudflare:workers'
import { createDb } from '../db/client'
import type { ClaimVerification, ClaimVerifier } from '../domain/ports'
import type { Concept } from '../domain/types'
import { extractFromHtml } from '../providers/readability/article-extractor'
import { getJson, jobStepKey } from '../repositories/blobs'
import { listSpansForSource } from '../repositories/sources'
import { buildCanonicalSource } from '../services/canonical-source'
import { insertTestJob, insertTestUser } from './factories'

const ARTICLE_HTML = `<!doctype html>
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

export async function insertPipelineJob() {
  const db = createDb(env.DB)
  const userId = await insertTestUser(db)
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
