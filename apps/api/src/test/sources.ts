import type { ExtractedSource } from '../domain/types'

export function videoTranscript(
  sentences: string[],
  sentenceMs: number,
  lengthMs = sentences.length * sentenceMs,
): ExtractedSource {
  let charStart = 0
  const spans = sentences.map((text, ordinal) => {
    const span = {
      ordinal,
      kind: 'text' as const,
      text,
      charStart,
      charEnd: charStart + text.length,
      startMs: ordinal * sentenceMs,
      endMs: (ordinal + 1) * sentenceMs,
    }
    charStart += text.length + 1
    return span
  })
  return {
    sourceType: 'video',
    title: null,
    channel: null,
    lengthMs,
    text: sentences.join(' '),
    spans,
  }
}
