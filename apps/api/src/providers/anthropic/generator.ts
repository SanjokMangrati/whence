import Anthropic from '@anthropic-ai/sdk'
import { DomainError } from '../../domain/errors'
import type { GenerationRequest, GenerationResult, Generator } from '../../domain/ports'

export interface GeneratorConfig {
  apiKey: string
  modelId: string
  inputUsdPerMTok: number
  outputUsdPerMTok: number
}

export function createAnthropicGenerator(config: GeneratorConfig): Generator {
  const client = new Anthropic({ apiKey: config.apiKey })

  return {
    async generate(request: GenerationRequest): Promise<GenerationResult> {
      let message: Anthropic.Message
      try {
        message = await client.messages
          .stream({
            model: config.modelId,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: 'user', content: userContent(request) }],
          })
          .finalMessage()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new DomainError('generation_failed', detail)
      }

      if (message.stop_reason === 'max_tokens') {
        throw new DomainError(
          'generation_failed',
          `The model stopped at the ${request.maxOutputTokens} token limit.`,
        )
      }
      if (message.stop_reason === 'refusal') {
        throw new DomainError('generation_failed', 'The model refused the request.')
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
      if (text.length === 0) {
        throw new DomainError('generation_failed', 'The model returned no text.')
      }

      const { usage } = message
      const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0
      return {
        text,
        modelId: message.model,
        usage: {
          inputTokens: usage.input_tokens + cacheWriteTokens + cacheReadTokens,
          outputTokens: usage.output_tokens,
          costUsd:
            ((usage.input_tokens +
              cacheWriteTokens * CACHE_WRITE_PRICE_FACTOR +
              cacheReadTokens * CACHE_READ_PRICE_FACTOR) *
              config.inputUsdPerMTok) /
              1_000_000 +
            (usage.output_tokens * config.outputUsdPerMTok) / 1_000_000,
        },
      }
    },
  }
}

const CACHE_WRITE_PRICE_FACTOR = 1.25
const CACHE_READ_PRICE_FACTOR = 0.1

function userContent(request: GenerationRequest): string | Anthropic.TextBlockParam[] {
  if (request.sharedPrefix === undefined) return request.prompt
  return [
    { type: 'text', text: request.sharedPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: request.prompt },
  ]
}
