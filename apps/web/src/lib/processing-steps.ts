import type { InferResponseType } from 'hono/client'
import type { api } from './api-client'

export type GenerationStatus = InferResponseType<(typeof api.generations)[':id']['$get'], 200>
type Stage = NonNullable<GenerationStatus['stage']>

const STEP_OF_STAGE: Record<Stage, number> = {
  validate: 0,
  cache_check: 0,
  extract: 0,
  extract_concepts: 1,
  check_concepts: 1,
  generate: 1,
  verify: 2,
  commit: 2,
}

export function currentStep(stage: Stage | null): number {
  return stage === null ? 0 : STEP_OF_STAGE[stage]
}

export function stepLabels(status: GenerationStatus): string[] {
  const writing = {
    notes: 'Writing your notes',
    cheat_sheet: 'Writing your cheat sheet',
    notes_and_cheat_sheet: 'Writing your notes and cheat sheet',
  }[status.outputType]
  return [
    status.sourceType === 'video' ? 'Watching the video' : 'Reading the article',
    writing,
    'Getting your questions ready',
  ]
}
