import type { GenerationRequest, Generator } from '../domain/ports'
import type { TokenUsage } from '../domain/types'
import { parseRewrites } from './model-output'

export interface Rewrite<T> {
  list: 'concepts' | 'steps' | 'statements'
  request: (failed: T[]) => GenerationRequest
  keep: (item: T, statement: string) => Promise<boolean>
}

export async function rewriteUnsupported<T>(
  generator: Generator,
  failed: T[],
  rewrite: Rewrite<T>,
): Promise<{ rewritten: number; usage: TokenUsage[] }> {
  if (failed.length === 0) return { rewritten: 0, usage: [] }
  const result = await generator.generate(rewrite.request(failed))
  const kept = await Promise.all(
    parseRewrites(result.text, rewrite.list, failed.length).map(
      ({ id, statement }) => statement !== null && rewrite.keep(failed[id]!, statement),
    ),
  )
  return { rewritten: kept.filter(Boolean).length, usage: [result.usage] }
}
