import type { Database } from '../../db/client'
import { DomainError } from '../../domain/errors'
import type { ClaimVerification, ClaimVerifier, Generator, Verdict } from '../../domain/ports'
import type { TokenUsage } from '../../domain/types'
import { sumUsage } from '../../domain/usage'
import { getJson, jobStepKey, putJson } from '../../repositories/blobs'
import type { SpendBudget } from '../../services/spend-budget'
import {
  MIN_MAPPING_ROWS,
  cellStatement,
  countClaims,
  statementsOf,
  type DraftArtifact,
  type DraftClaim,
  type DraftEntry,
  type DraftQaItem,
  type DraftSet,
} from '../drafts'
import {
  MAX_CLAIM_REWRITES,
  MAX_VERIFIER_CALLS,
  claimRewriteRequest,
  stepRewriteRequest,
  type ClaimForm,
} from '../prompts'
import { rewriteUnsupported } from '../rewrites'
import { evidenceOf, loadSpanViews } from '../spans'

type Statement = Omit<ClaimVerification, 'evidence'>

export type RejectedClaim =
  | (Statement & { spanIds: string[]; verdict: Verdict; probability: number })
  | (Statement & { invalidSpans: number[] })

export interface ClaimVerdict extends ClaimVerification {
  verdict: Verdict
  probability: number
}

export interface VerifyStepResult {
  claimsGenerated: number
  claimsRejected: number
  citationsInvalid: number
  claimsRewritten: number
  stepsUnsupported: number
  stepsRewritten: number
  verifierCalls: number
  usage: TokenUsage
  unsupported: string | null
}

interface Walkthrough {
  heading: string
  steps: DraftClaim[]
}

interface Check {
  statement: Statement
  cited: { spanIds: string[]; invalidSpans?: number[] }
  form: ClaimForm | { walkthrough: Walkthrough; index: number } | null
  rewriteContext?: string
  supported: boolean
  rewritten?: string
}

export async function verifyDrafts(
  deps: {
    db: Database
    bucket: R2Bucket
    generator: Generator
    verifier: ClaimVerifier
    budget: SpendBudget
  },
  input: { jobId: string; sourceId: string },
): Promise<VerifyStepResult> {
  const drafts = await getJson<DraftSet>(deps.bucket, jobStepKey(input.jobId, 'drafts'))

  const calls = verifierCallBound(drafts)
  if (calls > MAX_VERIFIER_CALLS) {
    throw new DomainError(
      'too_many_claims',
      `The drafts need ${calls} verifier calls. The bound is ${MAX_VERIFIER_CALLS}.`,
    )
  }

  await deps.budget.claimVerifierCalls(input.jobId, 'verified', calls)
  const spans = await loadSpanViews(deps.db, deps.bucket, input.sourceId)
  const usages: TokenUsage[] = []
  const rejected: RejectedClaim[] = []
  const verdicts: ClaimVerdict[] = []
  let citationsInvalid = 0
  let verifierCalls = 0

  async function isSupported(statement: Statement, cited: Check['cited']): Promise<boolean> {
    if (cited.invalidSpans !== undefined) {
      citationsInvalid += 1
      rejected.push({ ...statement, invalidSpans: cited.invalidSpans })
      return false
    }
    const evidence = evidenceOf(cited.spanIds, spans)
    const result = await deps.verifier.verify({ ...statement, evidence })
    usages.push(result.usage)
    verifierCalls += 1
    verdicts.push({
      ...statement,
      evidence,
      verdict: result.verdict,
      probability: result.probability,
    })
    if (result.verdict !== 'supported') {
      rejected.push({
        ...statement,
        spanIds: cited.spanIds,
        verdict: result.verdict,
        probability: result.probability,
      })
      return false
    }
    return true
  }

  const checks = new Map<object, Check>()
  const addCheck = (item: object, check: Omit<Check, 'supported'>) =>
    checks.set(item, { ...check, supported: false })
  for (const { artifactType, sections } of drafts.artifacts) {
    for (const { heading, entries } of sections) {
      const section = `Section: ${heading}.`
      for (const entry of entries) {
        switch (entry.kind) {
          case 'claim': {
            addCheck(entry.claim, {
              statement: { claim: entry.claim.text },
              cited: entry.claim,
              form: artifactType === 'notes' ? 'point' : 'entry',
              rewriteContext: section,
            })
            const subject = `${heading}. ${entry.claim.text}`
            for (const detail of entry.details) {
              addCheck(detail, {
                statement: { claim: detail.text, subject },
                cited: detail,
                form: 'detail',
                rewriteContext: `${section} Point: ${entry.claim.text}`,
              })
            }
            break
          }
          case 'steps': {
            const walkthrough = { heading, steps: entry.steps }
            entry.steps.forEach((step, index) => {
              addCheck(step, {
                statement: { claim: step.text, subject: section },
                cited: step,
                form: { walkthrough, index },
              })
            })
            break
          }
          case 'table':
            for (const row of entry.rows) {
              row.cells.forEach((cell, column) => {
                if (cell === null) return
                addCheck(cell, {
                  statement: { claim: cellStatement(row.label, entry.columns[column]!, cell.text) },
                  cited: cell,
                  form: null,
                })
              })
            }
            break
        }
      }
    }
  }
  for (const item of drafts.qaItems) {
    addCheck(item, {
      statement: { claim: item.answer, question: item.question },
      cited: item,
      form: 'answer',
      rewriteContext: `Question: ${item.question}`,
    })
  }

  await Promise.all(
    [...checks.values()].map(async (check) => {
      check.supported = await isSupported(check.statement, check.cited)
    }),
  )

  const failed = [...checks.values()].filter(
    (check) => !check.supported && check.cited.invalidSpans === undefined,
  )
  const failedSteps = failed.flatMap((check) =>
    check.form !== null && typeof check.form === 'object' ? [{ check, ...check.form }] : [],
  )
  const fixableSteps = failedSteps.filter(({ walkthrough }) =>
    walkthrough.steps.every((step) => step.invalidSpans === undefined),
  )
  const failedClaims = failed
    .flatMap((check) => (typeof check.form === 'string' ? [{ check, form: check.form }] : []))
    .slice(0, MAX_CLAIM_REWRITES)

  const keep = async (check: Check, statement: string) => {
    if (!(await isSupported({ ...check.statement, claim: statement }, check.cited))) return false
    check.supported = true
    check.rewritten = statement
    return true
  }

  const [stepRewrites, claimRewrites] = await Promise.all([
    rewriteUnsupported(deps.generator, fixableSteps, {
      list: 'steps',
      request: (failedItems) =>
        stepRewriteRequest(
          failedItems.map(({ check, walkthrough, index }) => ({
            statement: check.statement.claim,
            context: walkthroughContext(walkthrough, index),
            evidence: evidenceOf(check.cited.spanIds, spans),
          })),
        ),
      keep: ({ check }, statement) => keep(check, statement),
    }),
    rewriteUnsupported(deps.generator, failedClaims, {
      list: 'statements',
      request: (failedItems) =>
        claimRewriteRequest(
          failedItems.map(({ check, form }) => ({
            form,
            statement: check.statement.claim,
            context: check.rewriteContext,
            evidence: evidenceOf(check.cited.spanIds, spans),
          })),
        ),
      keep: ({ check }, statement) => keep(check, statement),
    }),
  ])

  const keptClaim = (claim: DraftClaim): DraftClaim | null => {
    const check = checks.get(claim)!
    return check.supported ? { text: check.rewritten ?? claim.text, spanIds: claim.spanIds } : null
  }

  const keepEntry = (entry: DraftEntry): DraftEntry[] => {
    switch (entry.kind) {
      case 'claim': {
        const claim = keptClaim(entry.claim)
        const details = entry.details
          .map(keptClaim)
          .filter((detail): detail is DraftClaim => detail !== null)
        return claim === null
          ? details.map((detail) => ({ kind: 'claim', claim: detail, details: [] }))
          : [{ kind: 'claim', claim, details }]
      }
      case 'steps': {
        const steps = entry.steps.map(keptClaim)
        return steps.every((step): step is DraftClaim => step !== null)
          ? [{ kind: 'steps', steps }]
          : []
      }
      case 'table': {
        const table = tableOrNull({
          kind: 'table',
          columns: entry.columns,
          rows: entry.rows.map((row) => ({
            label: row.label,
            cells: row.cells.map((cell) => (cell === null ? null : keptClaim(cell))),
          })),
        })
        return table === null ? [] : [table]
      }
    }
  }

  const artifacts: DraftArtifact[] = drafts.artifacts.map((artifact) => ({
    artifactType: artifact.artifactType,
    sections: artifact.sections
      .map((section) => ({ heading: section.heading, entries: section.entries.flatMap(keepEntry) }))
      .filter((section) => section.entries.length > 0),
  }))
  const qaItems: DraftQaItem[] = drafts.qaItems.flatMap((item) => {
    const check = checks.get(item)!
    return check.supported
      ? [{ question: item.question, answer: check.rewritten ?? item.answer, spanIds: item.spanIds }]
      : []
  })

  await Promise.all([
    putJson(deps.bucket, jobStepKey(input.jobId, 'rejected'), rejected),
    putJson(deps.bucket, jobStepKey(input.jobId, 'verdicts'), verdicts),
  ])

  const generated =
    drafts.artifacts.reduce((total, artifact) => total + countClaims(artifact.sections), 0) +
    drafts.qaItems.length
  const kept =
    artifacts.reduce((total, artifact) => total + countClaims(artifact.sections), 0) +
    qaItems.length

  const empty = artifacts.find((artifact) => artifact.sections.length === 0)
  const unsupported =
    empty !== undefined
      ? `No ${empty.artifactType} entry is supported by the source.`
      : qaItems.length === 0
        ? 'No question is supported by the source.'
        : null
  if (unsupported === null) {
    await putJson(deps.bucket, jobStepKey(input.jobId, 'verified'), { artifacts, qaItems })
  }

  return {
    claimsGenerated: generated,
    claimsRejected: generated - kept,
    citationsInvalid,
    claimsRewritten: claimRewrites.rewritten,
    stepsUnsupported: failedSteps.length,
    stepsRewritten: stepRewrites.rewritten,
    verifierCalls,
    usage: sumUsage([...usages, ...stepRewrites.usage, ...claimRewrites.usage]),
    unsupported,
  }
}

function verifierCallBound(drafts: DraftSet): number {
  const items =
    drafts.artifacts.reduce(
      (total, artifact) =>
        total + statementsOf(artifact.sections).filter((claim) => !claim.invalidSpans).length,
      0,
    ) + drafts.qaItems.filter((item) => !item.invalidSpans).length
  const steps = drafts.artifacts
    .flatMap((artifact) => artifact.sections.flatMap((section) => section.entries))
    .reduce((total, entry) => total + (entry.kind === 'steps' ? entry.steps.length : 0), 0)
  return items + steps + Math.min(MAX_CLAIM_REWRITES, items)
}

function walkthroughContext({ heading, steps }: Walkthrough, index: number) {
  return [
    `Section: ${heading}.`,
    ...(index > 0 ? [`First step: ${steps[0]!.text}`] : []),
    ...(index > 1 ? [`Previous step: ${steps[index - 1]!.text}`] : []),
  ].join(' ')
}

function tableOrNull(table: Extract<DraftEntry, { kind: 'table' }>): DraftEntry | null {
  const rows = table.rows.filter((row) => row.cells.some((cell) => cell !== null))
  const columns = table.columns
    .map((name, index) => ({ name, index }))
    .filter((column) => rows.some((row) => row.cells[column.index] !== null))
  const isComparison = rows.length >= 2 && columns.length >= 2
  const isMapping = rows.length >= MIN_MAPPING_ROWS && columns.length === 1
  if (!isComparison && !isMapping) return null
  return {
    kind: 'table',
    columns: columns.map((column) => column.name),
    rows: rows.map((row) => ({
      label: row.label,
      cells: columns.map((column) => row.cells[column.index] ?? null),
    })),
  }
}
