import { DomainError } from './errors'
import type { CanonicalSpan } from './types'

const MAX_WORDS_PER_SENTENCE_END = 40

const SENTENCE_END = /(?<=[.?!]["')\]]*)\s+/
const SENTENCE_END_MARK = /[.?!]["')\]]*(?=\s|$)/g
const NOT_A_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/gu

export function lacksPunctuation(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word !== '').length
  const ends = text.match(SENTENCE_END_MARK)?.length ?? 0
  return words > MAX_WORDS_PER_SENTENCE_END * ends
}

export function sameWords(original: string, punctuated: string): boolean {
  return lettersOf(original) === lettersOf(punctuated)
}

const MIN_ALIGNED = 0.95
const RESYNC_WINDOW = 16

export function punctuationFrom(original: string, answer: string): string | null {
  const words = original.split(/\s+/).filter((word) => word !== '')
  const marked = answer
    .replace(/[—–]/g, ' $& ')
    .split(/\s+/)
    .filter((word) => word !== '')
  const keys = words.map(lettersOf)
  const markedKeys = marked.map(lettersOf)

  const result: string[] = []
  let aligned = 0
  let i = 0
  let j = 0
  while (i < words.length) {
    if (j < marked.length && markedKeys[j] === '') {
      if (result.length > 0) result[result.length - 1] += ` ${marked[j]}`
      j++
    } else if (keys[i] === '') {
      result.push(words[i]!)
      i++
    } else if (j < marked.length && markedKeys[j] === keys[i]) {
      result.push(marked[j]!)
      aligned++
      i++
      j++
    } else {
      const skip = resync(keys, markedKeys, i, j)
      if (skip === null) {
        result.push(...words.slice(i))
        break
      }
      result.push(...words.slice(i, i + skip.words))
      i += skip.words
      j += skip.marked
    }
  }

  const total = keys.filter((key) => key !== '').length
  return aligned >= MIN_ALIGNED * total ? result.join(' ') : null
}

function resync(
  keys: string[],
  markedKeys: string[],
  i: number,
  j: number,
): { words: number; marked: number } | null {
  for (let distance = 1; distance <= RESYNC_WINDOW; distance++) {
    for (let words = 0; words <= distance; words++) {
      const key = keys[i + words]
      if (key !== undefined && key !== '' && key === markedKeys[j + distance - words]) {
        return { words, marked: distance - words }
      }
    }
  }
  return null
}

export function toSentenceSpans(
  lines: CanonicalSpan[],
  punctuated: string,
): { text: string; spans: CanonicalSpan[] } {
  if (!sameWords(lines.map((line) => line.text).join(' '), punctuated)) {
    throw new Error('The punctuated text does not hold the words of the caption lines.')
  }

  const lineEnds: number[] = []
  let total = 0
  for (const line of lines) {
    total += lettersOf(line.text).length
    lineEnds.push(total)
  }
  if (total === 0) {
    throw new DomainError('extraction_failed', 'The transcript has no words.')
  }

  const sentences: string[] = []
  for (const piece of punctuated.trim().split(SENTENCE_END)) {
    const clean = piece.replace(/\s+/g, ' ')
    if (sentences.length > 0 && lettersOf(clean) === '') {
      sentences[sentences.length - 1] += ` ${clean}`
    } else if (sentences.length === 1 && lettersOf(sentences[0]!) === '') {
      sentences[0] += ` ${clean}`
    } else {
      sentences.push(clean)
    }
  }

  const spans: CanonicalSpan[] = []
  let charStart = 0
  let position = 0
  let line = 0
  for (const [ordinal, sentence] of sentences.entries()) {
    while (lineEnds[line]! <= position) line++
    const first = line
    position += lettersOf(sentence).length
    while (lineEnds[line]! < position) line++
    spans.push({
      ordinal,
      kind: 'text',
      text: sentence,
      charStart,
      charEnd: charStart + sentence.length,
      startMs: lines[first]!.startMs,
      endMs: lines[line]!.endMs,
    })
    charStart += sentence.length + 1
  }

  return { text: sentences.join(' '), spans }
}

function lettersOf(text: string): string {
  return text.toLowerCase().replace(NOT_A_LETTER_OR_DIGIT, '')
}
