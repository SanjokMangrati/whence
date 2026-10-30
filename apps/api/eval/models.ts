export interface EvalResult {
  sourceId: string
  jobId: string
  modelId: string | null
  promptVersion: string | null
  status: 'completed' | 'failed'
  failedStage: string | null
  errorCode: string | null
  cached: boolean
  costUsd: number
  finishedAt: string
}

export interface ModelRow {
  modelId: string
  promptVersion: string
  generations: number
  passed: number
  costUsd: number
  costPerPassUsd: number | null
  cacheHits: number
  sourceFailures: number
}

const SOURCE_STAGES = new Set(['validate', 'cache_check', 'extract'])

export function summarizeByModel(results: EvalResult[]): ModelRow[] {
  const rows = new Map<string, Omit<ModelRow, 'costPerPassUsd'>>()
  for (const result of results) {
    if (result.modelId === null || result.promptVersion === null) continue
    const key = `${result.modelId}\n${result.promptVersion}`
    const row = rows.get(key) ?? {
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      generations: 0,
      passed: 0,
      costUsd: 0,
      cacheHits: 0,
      sourceFailures: 0,
    }
    if (result.cached) {
      row.cacheHits += 1
    } else if (result.status === 'failed' && SOURCE_STAGES.has(result.failedStage ?? '')) {
      row.sourceFailures += 1
    } else {
      row.generations += 1
      row.costUsd += result.costUsd
      if (result.status === 'completed') row.passed += 1
    }
    rows.set(key, row)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, costPerPassUsd: row.passed === 0 ? null : row.costUsd / row.passed }))
    .sort(
      (a, b) =>
        a.modelId.localeCompare(b.modelId) || a.promptVersion.localeCompare(b.promptVersion),
    )
}

export function modelTableLines(rows: ModelRow[]): string[] {
  return [
    '| Model | Prompt version | Generations | Passed | Cost | Cost per passing generation | Cache hits | Source failures |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.modelId} | ${row.promptVersion} | ${row.generations} | ${row.passed} | ${usd(row.costUsd)} | ${row.costPerPassUsd === null ? 'none passed' : usd(row.costPerPassUsd)} | ${row.cacheHits} | ${row.sourceFailures} |`,
    ),
    '',
  ]
}

function usd(value: number): string {
  return `${value.toFixed(4)} USD`
}
