import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { modelTableLines, summarizeByModel, type EvalResult } from './models.ts'

interface EvalSource {
  id: string
  url: string
  why: string
}

interface Citation {
  ordinal: number
  spanOrdinal: number
  startMs: number | null
  text: string
}

interface Span {
  id: string
  ordinal: number
  startMs: number | null
  text: string
}

interface Verdict {
  claim: string
  question?: string
  evidence: string[]
  verdict: string
  probability: number
}

interface Rejected {
  claim: string
  question?: string
  spanIds?: string[]
  verdict?: string
  probability?: number
}

interface Concept {
  id: string
  statement: string
  role: string
  topic: string
  shows: string[]
  spanIds: string[]
}

interface DraftClaim {
  text: string
  spanIds: string[]
}

type DraftEntry =
  | { kind: 'claim'; claim: DraftClaim; details: DraftClaim[] }
  | { kind: 'steps'; steps: DraftClaim[] }
  | { kind: 'table'; columns: string[]; rows: { label: string; cells: (DraftClaim | null)[] }[] }

interface DraftArtifact {
  artifactType: 'notes' | 'cheat_sheet'
  sections: { heading: string | null; entries: DraftEntry[] }[]
}

interface DraftSet {
  artifacts: DraftArtifact[]
}

interface Session {
  cookie: string
}

interface Status {
  status: 'queued' | 'running' | 'completed' | 'failed'
  stage: string | null
  errorCode: string | null
  title: string | null
  artifacts: { id: string; artifactType: 'notes' | 'cheat_sheet' }[]
}

interface Metric {
  model_id: string
  prompt_version: string
  cost_usd: number
  input_tokens: number
  output_tokens: number
  stage_durations_ms: string
  [column: string]: string | number | null
}

const ROOT = join(import.meta.dirname, '..')
const API = process.env.EVAL_API ?? 'http://localhost:8787'
const POLL_MS = 5000
const TIMEOUT_MS = 40 * 60_000
const RUNNING_JOBS = 3
const BUCKET = 'whence-content'
const ORIGIN = /^BETTER_AUTH_URL=["']?([^"'\r\n]+)/m.exec(
  readFileSync(join(ROOT, '.dev.vars'), 'utf8'),
)![1]!
const STATE = join(ROOT, '.wrangler', 'state', 'v3')

const RUBRIC = {
  qa: [
    'Single answer: two people who learned the source would give the same answer.',
    "Final version: the answer matches the source's final statement of the rule.",
    'Principle: the question does not bind a general property to an example, and does not ask about details of an example the source calls arbitrary.',
    'Lens: definition, cause, contrast, procedure, or prediction. Definitions under 30% of the set; every worked example has a prediction question.',
    'No set recall: the answer does not need 3 or more unordered items.',
    'Grounded: every part of the answer is in the cited text; citations are 1 to 3 sentences.',
    'Coverage: every principle has a question; core principles have 2 or 3; no aside has one.',
  ],
  notes: [
    'Reason kept: a rule includes its reason when the source gives one.',
    'Walkthroughs kept: every worked example or trace is one steps entry with its values.',
    'Scope: no claim is wider than the source states it.',
    'Final rule: no simplified rule stated as fact when the source later refines it.',
    'No duplicates: each fact appears once.',
    'Standalone: each detail names its subject and case.',
    'Citations: 1 to 3 sentences per entry, opening at the words that state the fact.',
    'Condensed: fewer words than the source; no filler, agenda, or promotion.',
  ],
  cheat_sheet: [
    'Lookup test: each entry answers a question a student looks up while working.',
    'Not a copy: no entry is a reworded notes point with no lookup value.',
    'Structure: mappings of 3 or more things are a table; ordered procedures are steps.',
    'Contrasts only from the source.',
    'Specific: each entry has a value, rule, name, condition, command, or mapping.',
  ],
}

async function main() {
  const all = JSON.parse(readFileSync(join(ROOT, 'eval', 'sources.json'), 'utf8')) as EvalSource[]
  const wanted = process.argv.slice(2)
  const sources = wanted.length === 0 ? all : all.filter((source) => wanted.includes(source.id))
  if (sources.length === 0) throw new Error(`No eval source is named ${wanted.join(', ')}.`)

  const session = await signUpOnPro()
  await addProviderKeyIfRequired(session)
  const runs = await inPool(sources, RUNNING_JOBS, (source) => runSource(session, source))

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const resultsDir = join(ROOT, 'eval', 'results')
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(
    join(resultsDir, `${stamp}.json`),
    JSON.stringify(
      runs.map((run) => run.result),
      null,
      2,
    ),
  )

  const reportsDir = join(ROOT, 'eval', 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const file = join(reportsDir, `${stamp}.md`)
  writeFileSync(
    file,
    [
      `# Eval run ${stamp}`,
      '',
      '## This run by model',
      '',
      ...modelTableLines(summarizeByModel(runs.map((run) => run.result))),
      '## All runs by model',
      '',
      ...modelTableLines(summarizeByModel(allResults(resultsDir))),
      ...runs.map((run) => run.section),
    ].join('\n'),
  )
  console.log(`Report: ${file}`)
}

function allResults(dir: string): EvalResult[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as EvalResult[])
}

async function inPool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

async function signUpOnPro(): Promise<Session> {
  const credentials = { email: `eval-${Date.now()}@example.test`, password: crypto.randomUUID() }
  const headers = { 'content-type': 'application/json', origin: ORIGIN }
  const signUp = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...credentials, name: 'Eval' }),
  })
  if (!signUp.ok) {
    throw new Error(`Sign-up returned ${signUp.status}: ${await signUp.text()}`)
  }
  const { user } = (await signUp.json()) as { user: { id: string } }

  const db = openState('d1', 'miniflare-D1DatabaseObject', false)
  db.prepare('UPDATE user SET email_verified = 1 WHERE id = ?').run(user.id)
  db.prepare(
    "INSERT INTO subscription (id, user_id, tier, status, updated_at) VALUES (?, ?, 'pro', 'active', ?)",
  ).run(crypto.randomUUID(), user.id, Math.floor(Date.now() / 1000))
  db.close()

  const signIn = await fetch(`${API}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(credentials),
  })
  if (!signIn.ok) {
    throw new Error(`Sign-in returned ${signIn.status}: ${await signIn.text()}`)
  }
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { cookie }
}

async function addProviderKeyIfRequired(session: Session) {
  const { required } = await api<{ required: boolean }>(session, '/me/provider-key')
  if (!required) return
  const key = process.env.ANTHROPIC_API_KEY
  if (key === undefined) {
    throw new Error('The API has no server key. Set ANTHROPIC_API_KEY for the eval account.')
  }
  await api(session, '/me/provider-key', { method: 'PUT', body: JSON.stringify({ key }) })
}

async function api<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { cookie: session.cookie, origin: ORIGIN, 'content-type': 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${path} returned ${response.status}: ${await response.text()}`,
    )
  }
  return (await response.json()) as T
}

async function runSource(
  session: Session,
  source: EvalSource,
): Promise<{ result: EvalResult; section: string }> {
  const { jobId } = await api<{ jobId: string }>(session, '/generations', {
    method: 'POST',
    body: JSON.stringify({ url: source.url, outputType: 'notes_and_cheat_sheet' }),
  })
  console.log(`${source.id}: job ${jobId}`)

  const started = Date.now()
  let status = await api<Status>(session, `/generations/${jobId}`)
  while (status.status === 'queued' || status.status === 'running') {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`${source.id}: job ${jobId} timed out.`)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    status = await api<Status>(session, `/generations/${jobId}`)
  }
  console.log(`${source.id}: ${status.status} in ${Math.round((Date.now() - started) / 1000)} s`)
  if (status.errorCode === 'provider_key_rejected') {
    throw new Error(`${source.id}: Anthropic rejected the key, so the run measures nothing.`)
  }

  const metric = readMetric(jobId)
  const recordJobId = canonicalJobOf(jobId)
  const result: EvalResult = {
    sourceId: source.id,
    jobId,
    modelId: metric?.model_id ?? null,
    promptVersion: metric?.prompt_version ?? null,
    status: status.status,
    failedStage: status.status === 'failed' ? status.stage : null,
    errorCode: status.errorCode,
    cached: recordJobId !== jobId,
    costUsd: metric === undefined ? 0 : Number(metric.cost_usd),
    finishedAt: new Date().toISOString(),
  }

  const lines = [
    `## ${source.id}: ${status.title ?? source.url}`,
    '',
    source.url,
    '',
    source.why,
    '',
    `Job \`${jobId}\`: ${status.status}${status.errorCode ? ` (${status.errorCode})` : ''}${result.cached ? ', served from the cache' : ''}`,
    '',
    ...metricLines(metric),
  ]

  const spans =
    status.status === 'failed' && status.stage === 'extract'
      ? []
      : (await api<{ spans: Span[] }>(session, `/generations/${jobId}/source`)).spans
  if (spans.length > 0) lines.push(...sourceLines(spans))
  lines.push(...conceptLines(recordJobId))

  const concepts = readJobRecord<Concept[]>(recordJobId, 'concepts')
  if (concepts !== undefined && spans.length > 0) {
    const ordinalById = new Map(spans.map((span) => [span.id, span.ordinal]))
    const ordinals = concepts.flatMap((concept) =>
      concept.spanIds.map((id) => ordinalById.get(id)!),
    )
    lines.push(reachLine('Concepts', ordinals, spans))
  }
  lines.push(...structureLines(recordJobId, spans))

  if (status.status === 'completed') {
    for (const artifactType of ['notes', 'cheat_sheet'] as const) {
      const ref = status.artifacts.find((artifact) => artifact.artifactType === artifactType)
      if (ref === undefined) continue
      const artifact = await api<{ markdown: string; citations: Citation[] }>(
        session,
        `/artifacts/${ref.id}`,
      )
      lines.push(
        `### ${artifactType === 'notes' ? 'Notes' : 'Cheat sheet'}`,
        '',
        reachLine(
          'Citations',
          artifact.citations.map((citation) => citation.spanOrdinal),
          spans,
        ),
        withCitations(artifact.markdown, artifact.citations),
        '',
        ...rubricLines(RUBRIC[artifactType]),
        ...(artifactType === 'notes' ? reviewLines(recordJobId) : []),
      )
    }

    const { items } = await api<{ items: { id: string }[] }>(
      session,
      `/study/jobs/${jobId}/questions`,
    )
    lines.push('### Q&A', '')
    for (const [index, { id }] of items.entries()) {
      const item = await api<{ question: string; answer: string; citations: Citation[] }>(
        session,
        `/study/questions/${id}/answer`,
      )
      lines.push(
        `${index + 1}. **Q:** ${item.question}`,
        `   **A:** ${item.answer}`,
        `   ${quote(item.citations)}`,
        '   Score: single answer [ ] final version [ ] principle [ ] lens ____ no set recall [ ] grounded [ ]',
        '',
      )
    }
    lines.push(...rubricLines(RUBRIC.qa))
  }

  lines.push(...verdictLines(recordJobId, spans))
  return { result, section: lines.join('\n') }
}

function readMetric(jobId: string): Metric | undefined {
  const db = openState('d1', 'miniflare-D1DatabaseObject')
  const metric = db.prepare('SELECT * FROM generation_metric WHERE job_id = ?').get(jobId) as
    Metric | undefined
  db.close()
  return metric
}

function metricLines(metric: Metric | undefined): string[] {
  if (metric === undefined) return ['No metric was recorded.', '']

  const durations = JSON.parse(metric.stage_durations_ms) as Record<string, number>
  const seconds = Object.entries(durations)
    .map(([stage, ms]) => `${stage} ${(ms / 1000).toFixed(1)} s`)
    .join(', ')
  return [
    '| Measure | Value |',
    '| --- | --- |',
    `| Model | ${metric.model_id} |`,
    `| Cost | ${Number(metric.cost_usd).toFixed(4)} USD |`,
    `| Tokens in / out | ${metric.input_tokens} / ${metric.output_tokens} |`,
    ...Object.entries(metric)
      .filter(([column]) => /^(claims|concepts|steps|citations|verifier)_/.test(column))
      .map(([column, value]) => `| ${column.replace(/_/g, ' ')} | ${value ?? ''} |`),
    `| Stages | ${seconds} |`,
    '',
  ]
}

function sourceLines(spans: Span[]): string[] {
  const lengths = spans.map((span) => span.text.length).sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0
  return [
    `Source: ${spans.length} spans, median ${median} characters.`,
    '',
    '<details><summary>First 10 spans</summary>',
    '',
    ...spans.slice(0, 10).map((span) => `- [${span.ordinal}] ${timeOf(span.startMs)}${span.text}`),
    '',
    '</details>',
    '',
  ]
}

function conceptLines(recordJobId: string): string[] {
  const concepts = readJobRecord<Concept[]>(recordJobId, 'concepts')
  if (concepts === undefined) return []
  return [
    '<details><summary>Concepts</summary>',
    '',
    ...concepts.map((concept, index) => {
      const shows = concept.shows.map((id) => concepts.findIndex((other) => other.id === id))
      const link = shows.length > 0 ? ` of ${shows.join(', ')}` : ''
      return `${index}. ${concept.role}${link} [${concept.topic}]: ${concept.statement}`
    }),
    '',
    '</details>',
    '',
  ]
}

function structureLines(recordJobId: string, spans: Span[]): string[] {
  const drafts = readJobRecord<DraftSet>(recordJobId, 'drafts')
  const verified = readJobRecord<DraftSet>(recordJobId, 'verified')
  if (drafts === undefined || verified === undefined) return []

  const lines = ['### Structure checks', '', '| Measure | Value |', '| --- | --- |']
  for (const draft of drafts.artifacts) {
    const kept = verified.artifacts.find((artifact) => artifact.artifactType === draft.artifactType)
    const draftEntries = draft.sections.flatMap((section) => section.entries)
    const keptEntries = kept?.sections.flatMap((section) => section.entries) ?? []

    const steps = draftEntries.filter((entry) => entry.kind === 'steps')
    const removed = steps.length - keptEntries.filter((entry) => entry.kind === 'steps').length

    const details = new Set(
      draftEntries.flatMap((entry) =>
        entry.kind === 'claim' ? entry.details.map((detail) => detail.text) : [],
      ),
    )
    const promoted = keptEntries.filter(
      (entry) => entry.kind === 'claim' && details.has(entry.claim.text),
    ).length

    const label = draft.artifactType === 'notes' ? 'Notes' : 'Cheat sheet'
    lines.push(
      `| ${label}: walkthroughs removed by verify | ${removed} of ${steps.length} |`,
      `| ${label}: details promoted to points | ${promoted} |`,
    )
  }

  const notes = verified.artifacts.find((artifact) => artifact.artifactType === 'notes')
  const draftNotes = drafts.artifacts.find((artifact) => artifact.artifactType === 'notes')
  if (notes === undefined || draftNotes === undefined) return [...lines, '']

  const points = notes.sections.map((section) => section.entries.length)
  const claimPoints = notes.sections
    .flatMap((section) => section.entries)
    .filter((entry) => entry.kind === 'claim')
  const pointCount = points.reduce((total, count) => total + count, 0)
  const concepts = readJobRecord<Concept[]>(recordJobId, 'checked')
  lines.push(
    `| Notes: sections | ${points.length} |`,
    `| Notes: points per section | ${(pointCount / points.length).toFixed(1)} |`,
    `| Notes: sections with 1 point | ${points.filter((count) => count === 1).length} |`,
    `| Notes: details per claim point | ${(claimPoints.reduce((total, entry) => total + entry.details.length, 0) / claimPoints.length).toFixed(1)} |`,
    `| Notes: points per concept | ${concepts === undefined ? '' : (pointCount / concepts.length).toFixed(2)} |`,
  )

  const sectionsBySpan = new Map<string, Set<number>>()
  draftNotes.sections.forEach((section, index) => {
    for (const claim of section.entries.flatMap(claimsOf)) {
      for (const spanId of claim.spanIds) {
        sectionsBySpan.set(spanId, (sectionsBySpan.get(spanId) ?? new Set()).add(index))
      }
    }
  })
  const split = [...sectionsBySpan].filter(([, sections]) => sections.size > 1)
  const byId = new Map(spans.map((span) => [span.id, span]))
  lines.push(
    `| Notes drafts: spans cited in more than one section | ${split.length} of ${sectionsBySpan.size} |`,
    '',
  )
  if (split.length === 0) return lines
  return [
    ...lines,
    '<details><summary>Spans cited in more than one section</summary>',
    '',
    ...split
      .map(([spanId, sections]) => ({ span: byId.get(spanId), sections }))
      .sort((a, b) => (a.span?.ordinal ?? 0) - (b.span?.ordinal ?? 0))
      .map(
        ({ span, sections }) =>
          `- [${span?.ordinal ?? '?'}] ${span?.text ?? ''} (sections: ${[...sections]
            .map((index) => draftNotes.sections[index]!.heading ?? 'untitled')
            .join('; ')})`,
      ),
    '',
    '</details>',
    '',
  ]
}

function claimsOf(entry: DraftEntry): DraftClaim[] {
  switch (entry.kind) {
    case 'claim':
      return [entry.claim, ...entry.details]
    case 'steps':
      return entry.steps
    case 'table':
      return entry.rows.flatMap((row) => row.cells.filter((cell) => cell !== null))
  }
}

function reviewLines(recordJobId: string): string[] {
  const verified = readJobRecord<DraftSet>(recordJobId, 'verified')
  const notes = verified?.artifacts.find((artifact) => artifact.artifactType === 'notes')
  if (notes === undefined) return []

  const lines = [
    '### Notes review sheet',
    '',
    'Write what is wrong with each section in your own words. Codes, if they fit:',
    '',
    '- A1: an example or analogy is stated as a general fact.',
    '- A1b: a general fact is stated through one example, so it reads as a property of that example.',
    '- A2: an example is cut short, or its setup is missing.',
    '- B: another entry states the same concept.',
    '- C: the section reads as disconnected facts, or an entry is unclear without the source.',
    '- D: an entry is vague or wrong.',
    '',
  ]
  for (const section of notes.sections) {
    lines.push(`#### ${section.heading ?? 'Untitled'}`, '')
    for (const entry of section.entries) {
      switch (entry.kind) {
        case 'claim':
          lines.push(
            `- ${entry.claim.text}`,
            ...entry.details.map((detail) => `  - ${detail.text}`),
          )
          break
        case 'steps':
          lines.push(
            '- Steps:',
            ...entry.steps.map((step, index) => `  ${index + 1}. ${step.text}`),
          )
          break
        case 'table':
          lines.push(
            `- Table: ${entry.columns.join(' | ')}`,
            ...entry.rows.map(
              (row) =>
                `  - ${row.label}: ${row.cells.map((cell) => cell?.text ?? '-').join(' | ')}`,
            ),
          )
          break
      }
    }
    lines.push('', 'Review: ', '')
  }
  return lines
}

function withCitations(markdown: string, citations: Citation[]): string {
  const byMarker = new Map(citations.map((citation) => [citation.ordinal + 1, citation]))
  const tableNotes: string[] = []
  const body = markdown.split('\n').map((line) => {
    const markers = [...line.matchAll(/\[\^(\d+)\]/g)].map((match) => Number(match[1]))
    if (markers.length === 0) return line
    const cited = markers
      .map((marker) => byMarker.get(marker))
      .filter((citation) => citation !== undefined)
    if (line.trimStart().startsWith('|')) {
      tableNotes.push(
        ...cited.map((citation) => `[^${citation.ordinal + 1}]: ${quoteText([citation])}`),
      )
      return line
    }
    const indent = /^\s*/.exec(line)![0]
    return `${line.replace(/\[\^\d+\]/g, '')}\n${indent}  ${quote(cited)}`
  })
  return [...body, '', ...tableNotes].join('\n')
}

function quote(citations: Citation[]): string {
  return citations.length === 0 ? '> (no citation)' : `> ${quoteText(citations)}`
}

function quoteText(citations: Citation[]): string {
  const sorted = [...citations].sort((a, b) => a.spanOrdinal - b.spanOrdinal)
  let text = ''
  sorted.forEach((citation, index) => {
    const joined = index > 0 && sorted[index - 1]!.spanOrdinal === citation.spanOrdinal - 1
    text += index === 0 ? '' : joined ? ' ' : ' ... '
    text += `${joined ? '' : timeOf(citation.startMs)}${citation.text}`
  })
  return `${text} (${sorted.length} spans)`
}

function reachLine(label: string, ordinals: number[], spans: Span[]): string {
  const last = spans.reduce((latest, span) => (span.ordinal > latest.ordinal ? span : latest))
  const reached = spans.find((span) => span.ordinal === Math.max(...ordinals))
  if (reached === undefined) return `${label} cite no span.\n`
  const times =
    reached.startMs === null
      ? ''
      : ` (${timeOf(reached.startMs).trim()} of ${timeOf(last.startMs).trim()})`
  return `${label} reach span ${reached.ordinal} of ${last.ordinal}${times}.\n`
}

function timeOf(ms: number | null): string {
  if (ms === null) return ''
  const seconds = Math.floor(ms / 1000)
  return `[${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}] `
}

function rubricLines(items: string[]): string[] {
  return ['Rubric (count passes):', '', ...items.map((item) => `- [ ] ${item}`), '']
}

function verdictLines(recordJobId: string, spans: Span[]): string[] {
  const verdicts = readJobRecord<Verdict[]>(recordJobId, 'verdicts')
  const rejected = readJobRecord<Rejected[]>(recordJobId, 'rejected')
  const lines: string[] = []

  if (verdicts !== undefined) {
    lines.push(
      '### Verifier verdicts',
      '',
      'Label each claim: T (the evidence states it) or W (it does not).',
      '',
    )
    for (const verdict of [...verdicts].sort((a, b) => a.probability - b.probability)) {
      lines.push(
        `- ${verdict.probability.toFixed(2)} ${verdict.verdict}. Label: __`,
        ...(verdict.question ? [`  Q: ${verdict.question}`] : []),
        `  Claim: ${verdict.claim}`,
        `  > ${verdict.evidence.join(' ... ')}`,
        '',
      )
    }
  } else if (rejected !== undefined) {
    const byId = new Map(spans.map((span) => [span.id, span]))
    lines.push('### Rejected claims', '')
    for (const claim of rejected) {
      const cited = (claim.spanIds ?? []).map((id) => byId.get(id)?.text ?? id).join(' ')
      lines.push(
        `- ${claim.probability?.toFixed(2) ?? 'invalid span'} ${claim.verdict ?? ''}: ${claim.claim}`,
        ...(claim.question ? [`  Q: ${claim.question}`] : []),
        `  > ${cited}`,
        '',
      )
    }
  } else {
    lines.push('No verifier record was found.', '')
  }
  return lines
}

function canonicalJobOf(jobId: string): string {
  const db = openState('d1', 'miniflare-D1DatabaseObject')
  const row = db
    .prepare(
      `SELECT c.canonical_job_id AS id FROM artifact_cache c
       JOIN generation_job j ON j.source_id = c.source_id
       JOIN generation_metric m ON m.job_id = j.id AND m.prompt_version = c.prompt_version
       WHERE j.id = ? LIMIT 1`,
    )
    .get(jobId) as { id: string } | undefined
  db.close()
  return row?.id ?? jobId
}

function readJobRecord<T>(jobId: string, step: string): T | undefined {
  const db = openState('r2', 'miniflare-R2BucketObject')
  const row = db
    .prepare('SELECT blob_id FROM _mf_objects WHERE key = ?')
    .get(`jobs/${jobId}/${step}.json`) as { blob_id: string } | undefined
  db.close()
  if (row === undefined) return undefined
  const blob = join(STATE, 'r2', BUCKET, 'blobs', row.blob_id)
  return existsSync(blob) ? (JSON.parse(readFileSync(blob, 'utf8')) as T) : undefined
}

function openState(kind: 'd1' | 'r2', object: string, readOnly = true): DatabaseSync {
  const dir = join(STATE, kind, object)
  const file = readdirSync(dir).find(
    (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite',
  )
  if (file === undefined) throw new Error(`No local ${kind} state in ${dir}.`)
  return new DatabaseSync(join(dir, file), { readOnly })
}

await main()
