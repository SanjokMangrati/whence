import type { ExtractedSource } from '../types'

export interface TranscriptSource {
  captions(url: string): Promise<ExtractedSource | null>
}
