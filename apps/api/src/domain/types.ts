export type SourceType = 'video' | 'article'

export type ArtifactType = 'notes' | 'cheat_sheet'

export type OutputType = 'notes' | 'cheat_sheet' | 'notes_and_cheat_sheet'

export type SpanKind = 'text' | 'heading' | 'code' | 'row'

export interface CanonicalSpan {
  ordinal: number
  kind: SpanKind
  text: string
  charStart: number
  charEnd: number
  startMs: number | null
  endMs: number | null
}

export interface ExtractedSource {
  sourceType: SourceType
  title: string | null
  channel: string | null
  lengthMs: number | null
  text: string
  spans: CanonicalSpan[]
}

export type ConceptRole = 'principle' | 'worked_example' | 'example' | 'analogy' | 'aside'

export interface Concept {
  id: string
  statement: string
  role: ConceptRole
  topic: string
  showsPrincipleIds: string[]
  spanIds: string[]
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type RecallRating = 'again' | 'hard' | 'good' | 'easy'

export interface ReviewState {
  easeFactor: number
  intervalDays: number
  repetitions: number
}
