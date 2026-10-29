import { DomainError } from '../domain/errors'
import type { Generator } from '../domain/ports'
import { lacksPunctuation, punctuationFrom, toSentenceSpans } from '../domain/sentences'
import type { ExtractedSource, TokenUsage } from '../domain/types'
import { sentenceRequest } from './prompts'

const CHUNK_WORDS = 3000
const ATTEMPTS = 2

export async function toSentences(
  generator: Generator,
  transcript: ExtractedSource,
): Promise<{ transcript: ExtractedSource; usage: TokenUsage[] }> {
  const lines = transcript.spans
  if (!lacksPunctuation(transcript.text)) {
    const sentences = toSentenceSpans(lines, lines.map((line) => line.text).join(' '))
    return { transcript: { ...transcript, ...sentences }, usage: [] }
  }

  const chunks = chunksOf(lines.map((line) => line.text))
  const results = await Promise.all(
    chunks.map((chunk) => punctuate(generator, transcript.title, chunk)),
  )
  const sentences = toSentenceSpans(lines, results.map((result) => result.text).join(' '))
  return {
    transcript: { ...transcript, ...sentences },
    usage: results.flatMap((result) => result.usage),
  }
}

async function punctuate(
  generator: Generator,
  title: string | null,
  chunk: string,
): Promise<{ text: string; usage: TokenUsage[] }> {
  const usage: TokenUsage[] = []
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const result = await generator.generate(sentenceRequest(title, chunk))
    usage.push(result.usage)
    const text = punctuationFrom(chunk, result.text)
    if (text !== null) {
      return { text, usage }
    }
  }
  throw new DomainError(
    'extraction_failed',
    'The punctuated transcript does not align with the caption words.',
  )
}

function chunksOf(lines: string[]): string[] {
  const chunks: string[] = []
  let current: string[] = []
  let words = 0
  for (const line of lines) {
    current.push(line)
    words += line.split(/\s+/).filter((word) => word !== '').length
    if (words >= CHUNK_WORDS) {
      chunks.push(current.join(' '))
      current = []
      words = 0
    }
  }
  if (current.length > 0) chunks.push(current.join(' '))
  return chunks
}
