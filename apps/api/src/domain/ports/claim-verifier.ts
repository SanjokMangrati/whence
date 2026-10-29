import type { TokenUsage } from '../types'

export type Verdict = 'supported' | 'unsupported' | 'uncertain'

export interface ClaimVerification {
  claim: string
  evidence: string[]
  question?: string
  subject?: string
}

export interface VerificationResult {
  verdict: Verdict
  probability: number
  usage: TokenUsage
}

export interface ClaimVerifier {
  verify(input: ClaimVerification): Promise<VerificationResult>
}
