import type { ExtractedSource } from './types'

const WORDS_PER_MINUTE = 200

export function sourceLengthMs(source: ExtractedSource): number {
  if (source.lengthMs !== null) {
    return source.lengthMs
  }
  const words = source.text.split(/\s+/).filter((word) => word !== '').length
  return Math.round((words / WORDS_PER_MINUTE) * 60_000)
}

const MIN_CAPTION_COVERAGE = 0.8

export function captionsCoverVideo(captionsEndMs: number, videoLengthMs: number): boolean {
  return captionsEndMs >= videoLengthMs * MIN_CAPTION_COVERAGE
}
