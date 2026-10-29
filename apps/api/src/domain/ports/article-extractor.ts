import type { ExtractedSource } from '../types'

export interface ArticleExtractor {
  extract(url: string): Promise<ExtractedSource>
}
