import { DomainError } from '../../domain/errors'
import type { ClaimVerification, ClaimVerifier, VerificationResult } from '../../domain/ports'
import { askNoul, type JevConfig, type NoulQuestion } from './client'

const QUESTION = 'supported'

const SUPPORTED_AT = 0.75
const UNSUPPORTED_AT = 0.5

const CLAIM_CRITERIA = {
  true: 'Every part of the statement follows from the evidence.',
  false: 'Part of the statement is absent from the evidence or contradicts it.',
}

const ANSWER_CRITERIA = {
  true: 'The answer is a correct answer to the question, and every part of it follows from the evidence.',
  false:
    'Part of the answer is absent from the evidence or contradicts it, or the question assumes something the evidence does not support.',
}

function noulQuestion(input: ClaimVerification): NoulQuestion {
  if (input.question === undefined) {
    const subject =
      input.subject === undefined
        ? ''
        : `This context tells what the statement is about. It is not judged. Context: ${input.subject} `
    return {
      type: 'noul',
      instructions: `${subject}The following statement is fully supported by the evidence in the state. Statement: ${input.claim}`,
      criteria: CLAIM_CRITERIA,
    }
  }
  return {
    type: 'noul',
    instructions: `The following answer to the question is fully supported by the evidence in the state. Question: ${input.question} Answer: ${input.claim}`,
    criteria: ANSWER_CRITERIA,
  }
}

export function createJevClaimVerifier(config: JevConfig): ClaimVerifier {
  return {
    async verify(input: ClaimVerification): Promise<VerificationResult> {
      let result
      try {
        result = await askNoul(
          config,
          { evidence: input.evidence },
          { [QUESTION]: noulQuestion(input) },
        )
      } catch (error) {
        throw new DomainError(
          'verifier_request_failed',
          error instanceof Error ? error.message : String(error),
        )
      }

      const probability = result.probabilities[QUESTION]!
      return {
        verdict:
          probability >= SUPPORTED_AT
            ? 'supported'
            : probability <= UNSUPPORTED_AT
              ? 'unsupported'
              : 'uncertain',
        probability,
        usage: result.usage,
      }
    },
  }
}
