import type { Database } from '../../db/client'
import { DomainError } from '../../domain/errors'
import type { ClaimVerifier, Generator } from '../../domain/ports'
import type { Concept, TokenUsage } from '../../domain/types'
import { sumUsage } from '../../domain/usage'
import { getJson, jobStepKey, putJson } from '../../repositories/blobs'
import type { SpendBudget } from '../../services/spend-budget'
import { conceptRewriteRequest } from '../prompts'
import { rewriteUnsupported } from '../rewrites'
import { evidenceOf, loadSpanViews } from '../spans'

export interface CheckConceptsStepResult {
  conceptsUnsupported: number
  conceptsRewritten: number
  verifierCalls: number
  usage: TokenUsage
}

interface ConceptCheck {
  concept: Concept
  evidence: string[]
  supported: boolean
}

export async function checkConcepts(
  deps: {
    db: Database
    bucket: R2Bucket
    generator: Generator
    verifier: ClaimVerifier
    budget: SpendBudget
  },
  input: { jobId: string; sourceId: string },
): Promise<CheckConceptsStepResult> {
  const concepts = (
    await getJson<Concept[]>(deps.bucket, jobStepKey(input.jobId, 'concepts'))
  ).filter((concept) => concept.role !== 'aside')
  if (concepts.length === 0) {
    throw new DomainError('generation_failed', 'The model found only asides in the source.')
  }
  await deps.budget.claimVerifierCalls(input.jobId, 'checked', concepts.length * 2)
  const spans = await loadSpanViews(deps.db, deps.bucket, input.sourceId)
  const usages: TokenUsage[] = []
  let verifierCalls = 0

  const isSupported = async (statement: string, evidence: string[]) => {
    const result = await deps.verifier.verify({ claim: statement, evidence })
    usages.push(result.usage)
    verifierCalls += 1
    return result.verdict === 'supported'
  }

  const checks: ConceptCheck[] = await Promise.all(
    concepts.map(async (concept) => {
      const evidence = evidenceOf(concept.spanIds, spans)
      return { concept, evidence, supported: await isSupported(concept.statement, evidence) }
    }),
  )
  const unsupported = checks.filter((check) => !check.supported)

  const checked = [...concepts]
  const rewrites = await rewriteUnsupported(deps.generator, unsupported, {
    list: 'concepts',
    request: (failed) =>
      conceptRewriteRequest(
        failed.map((check) => ({ statement: check.concept.statement, evidence: check.evidence })),
      ),
    keep: async ({ concept, evidence }, statement) => {
      if (!(await isSupported(statement, evidence))) return false
      checked[concepts.indexOf(concept)] = { ...concept, statement }
      return true
    },
  })

  await putJson(deps.bucket, jobStepKey(input.jobId, 'checked'), checked)
  return {
    conceptsUnsupported: unsupported.length,
    conceptsRewritten: rewrites.rewritten,
    verifierCalls,
    usage: sumUsage([...usages, ...rewrites.usage]),
  }
}
