import type { TokenUsage } from '../types'

export interface GenerationRequest {
  system: string
  sharedPrefix?: string
  prompt: string
  maxOutputTokens: number
}

export interface GenerationResult {
  text: string
  modelId: string
  usage: TokenUsage
}

export interface Generator {
  generate(request: GenerationRequest): Promise<GenerationResult>
}
