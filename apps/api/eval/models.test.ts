import { describe, expect, it } from 'vitest'
import { modelTableLines, summarizeByModel, type EvalResult } from './models.ts'

function result(overrides: Partial<EvalResult>): EvalResult {
  return {
    sourceId: 'event-loop',
    jobId: crypto.randomUUID(),
    modelId: 'model-a',
    promptVersion: 'v1',
    status: 'completed',
    failedStage: null,
    errorCode: null,
    cached: false,
    costUsd: 0.02,
    finishedAt: '2026-10-30T09:00:00Z',
    ...overrides,
  }
}

describe('per-model eval summary', () => {
  it('divides the cost of every generation by the passing ones', () => {
    const [row] = summarizeByModel([
      result({ costUsd: 0.02 }),
      result({ costUsd: 0.03 }),
      result({ status: 'failed', failedStage: 'verify', costUsd: 0.04 }),
    ])

    expect(row).toMatchObject({ generations: 3, passed: 2, costPerPassUsd: 0.045 })
    expect(row!.costUsd).toBeCloseTo(0.09)
  })

  it('leaves out cache hits and failures before the model runs', () => {
    const [row] = summarizeByModel([
      result({ costUsd: 0.02 }),
      result({ cached: true, costUsd: 0 }),
      result({ status: 'failed', failedStage: 'extract', costUsd: 0 }),
    ])

    expect(row).toMatchObject({
      generations: 1,
      passed: 1,
      costUsd: 0.02,
      costPerPassUsd: 0.02,
      cacheHits: 1,
      sourceFailures: 1,
    })
  })

  it('keeps each model and prompt version apart', () => {
    const rows = summarizeByModel([
      result({ modelId: 'model-b' }),
      result({ modelId: 'model-a', promptVersion: 'v2' }),
      result({ modelId: 'model-a' }),
      result({ modelId: null, promptVersion: null }),
    ])

    expect(rows.map((row) => [row.modelId, row.promptVersion])).toEqual([
      ['model-a', 'v1'],
      ['model-a', 'v2'],
      ['model-b', 'v1'],
    ])
  })

  it('shows a model with no passing generation as none passed', () => {
    const lines = modelTableLines(
      summarizeByModel([result({ status: 'failed', failedStage: 'generate', costUsd: 0.01 })]),
    )

    expect(lines[2]).toBe('| model-a | v1 | 1 | 0 | 0.0100 USD | none passed | 0 | 0 |')
  })
})
