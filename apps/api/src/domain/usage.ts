import type { TokenUsage } from './types'

export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      costUsd: total.costUsd + usage.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  )
}

export function utcMonthOf(date: Date): string {
  return date.toISOString().slice(0, 7)
}

const DAY_MS = 24 * 60 * 60 * 1000

export function utcDayOf(date: Date): { from: Date; to: Date } {
  const from = new Date(date.toISOString().slice(0, 10))
  return { from, to: new Date(from.getTime() + DAY_MS) }
}
