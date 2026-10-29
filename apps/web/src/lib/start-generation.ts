import { track } from './analytics'
import { api, readErrorCode, type OutputType } from './api-client'

export type StartResult = { jobId: string } | { errorCode: string }

export async function startGeneration(url: string, outputType: OutputType): Promise<StartResult> {
  track('source_submitted', { output_type: outputType })
  const response = await api.generations.$post({ json: { url, outputType } }).catch(() => null)
  if (response?.ok) {
    const { jobId } = await response.json()
    track('generation_started', { output_type: outputType })
    return { jobId }
  }
  return { errorCode: (await readErrorCode(response)) ?? 'internal_error' }
}
