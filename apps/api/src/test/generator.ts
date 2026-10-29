import type { GenerationRequest, Generator } from '../domain/ports'

export function fakeGenerator(responses: string[]): Generator & { requests: GenerationRequest[] } {
  const requests: GenerationRequest[] = []
  return {
    requests,
    generate: async (request) => {
      const text = responses[requests.length]
      if (text === undefined) {
        throw new Error(`The generator was called ${requests.length + 1} times.`)
      }
      requests.push(request)
      return {
        text,
        modelId: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
      }
    },
  }
}
