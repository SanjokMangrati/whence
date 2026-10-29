import { DomainError } from '../../domain/errors'
import type { TranscriptSource } from '../../domain/ports'
import type { CanonicalSpan, ExtractedSource } from '../../domain/types'

const API_BASE = 'https://api.supadata.ai/v1'

const POLL_INTERVAL_MS = 1000
const MAX_POLLS = 600

const TRANSCRIPT_UNAVAILABLE = 'transcript-unavailable'

interface SupadataChunk {
  text: string
  offset: number
  duration: number
  lang: string
}

interface SupadataTranscript {
  content: SupadataChunk[]
  lang: string
}

interface SupadataJobAccepted {
  jobId: string
}

interface SupadataError {
  error: string
  message: string
}

interface SupadataJob {
  status: 'queued' | 'active' | 'completed' | 'failed'
  content?: SupadataChunk[]
  error?: SupadataError | null
}

export interface SupadataConfig {
  apiKey: string
}

class SupadataRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SupadataRequestError'
  }
}

export function createSupadataTranscriptSource(config: SupadataConfig): TranscriptSource {
  return {
    async captions(url: string): Promise<ExtractedSource | null> {
      try {
        return toTranscript(await requestCaptions(config, url))
      } catch (error) {
        if (error instanceof SupadataRequestError && error.code === TRANSCRIPT_UNAVAILABLE) {
          return null
        }
        throw asDomainError(error)
      }
    },
  }
}

async function requestCaptions(config: SupadataConfig, url: string): Promise<SupadataChunk[]> {
  const endpoint = `${API_BASE}/transcript?url=${encodeURIComponent(url)}&mode=native&lang=en`
  const response = await fetch(endpoint, { headers: { 'x-api-key': config.apiKey } })

  if (response.status === 202) {
    const { jobId } = (await response.json()) as SupadataJobAccepted
    return pollJob(config, jobId)
  }
  if (!response.ok) {
    throw await toRequestError(response)
  }

  const { content } = (await response.json()) as SupadataTranscript
  return content
}

async function pollJob(config: SupadataConfig, jobId: string): Promise<SupadataChunk[]> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const response = await fetch(`${API_BASE}/transcript/${jobId}`, {
      headers: { 'x-api-key': config.apiKey },
    })
    if (!response.ok) {
      throw await toRequestError(response)
    }

    const job = (await response.json()) as SupadataJob
    if (job.status === 'completed') {
      return job.content ?? []
    }
    if (job.status === 'failed') {
      throw new SupadataRequestError(
        job.error?.error ?? 'job-failed',
        job.error?.message ?? `Transcript job ${jobId} failed.`,
      )
    }
  }

  throw new SupadataRequestError('job-timeout', `Transcript job ${jobId} did not complete.`)
}

async function toRequestError(response: Response): Promise<SupadataRequestError> {
  const body = (await response.json().catch(() => null)) as SupadataError | null
  return new SupadataRequestError(
    body?.error ?? `http-${response.status}`,
    body?.message ?? `Supadata returned ${response.status}.`,
  )
}

function asDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) {
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  return new DomainError('extraction_failed', message)
}

function toTranscript(chunks: SupadataChunk[]): ExtractedSource {
  if (chunks.length === 0) {
    throw new DomainError('extraction_failed', 'The transcript is empty.')
  }

  const parts = toParts(chunks)
  const spans: CanonicalSpan[] = []
  let charStart = 0
  for (const [ordinal, part] of parts.entries()) {
    spans.push({
      ordinal,
      kind: 'text',
      text: part.text,
      charStart,
      charEnd: charStart + part.text.length,
      startMs: part.startMs,
      endMs: part.endMs,
    })
    charStart += part.text.length + 1
  }

  const last = chunks[chunks.length - 1]!
  return {
    sourceType: 'video',
    title: null,
    channel: null,
    lengthMs: last.offset + last.duration,
    text: parts.map((part) => part.text).join('\n'),
    spans,
  }
}

const MAX_SPAN_CHARS = 140

const SENTENCE_END = /(?<=[.?!]["')\]]*) /

interface TimedText {
  text: string
  startMs: number
  endMs: number
}

function toParts(chunks: SupadataChunk[]): TimedText[] {
  if (chunks.every((chunk) => chunk.text.length <= MAX_SPAN_CHARS)) {
    return chunks.map((chunk) => ({
      text: chunk.text,
      startMs: chunk.offset,
      endMs: chunk.offset + chunk.duration,
    }))
  }

  let text = ''
  const bounds: { start: number; end: number; chunk: SupadataChunk }[] = []
  for (const chunk of chunks) {
    const clean = chunk.text.replace(/\s+/g, ' ').trim()
    if (clean === '') continue
    if (text !== '') text += ' '
    bounds.push({ start: text.length, end: text.length + clean.length, chunk })
    text += clean
  }
  const timeAt = (position: number) => {
    const bound = bounds.find((candidate) => position <= candidate.end) ?? bounds.at(-1)!
    const length = bound.end - bound.start
    const within = Math.min(Math.max(position - bound.start, 0), length)
    return bound.chunk.offset + Math.round((bound.chunk.duration * within) / length)
  }

  const pieces = text
    .split(SENTENCE_END)
    .flatMap((sentence) => (sentence.length <= MAX_SPAN_CHARS ? [sentence] : byWords(sentence)))
  const texts: string[] = []
  for (const piece of pieces) {
    const lastText = texts.at(-1)
    if (lastText !== undefined && lastText.length + 1 + piece.length <= MAX_SPAN_CHARS) {
      texts[texts.length - 1] = `${lastText} ${piece}`
    } else {
      texts.push(piece)
    }
  }

  let position = 0
  return texts.map((part) => {
    const timed = { text: part, startMs: timeAt(position), endMs: timeAt(position + part.length) }
    position += part.length + 1
    return timed
  })
}

function byWords(sentence: string): string[] {
  const words = sentence.split(' ')
  const count = Math.ceil(sentence.length / MAX_SPAN_CHARS)
  const target = sentence.length / count
  const parts: string[] = []
  let current = ''
  for (const word of words) {
    if (current !== '' && current.length + 1 + word.length > target) {
      parts.push(current)
      current = word
    } else {
      current = current === '' ? word : `${current} ${word}`
    }
  }
  if (current !== '') parts.push(current)
  return parts
}
