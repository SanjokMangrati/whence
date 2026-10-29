import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { DomainError } from '../../domain/errors'
import type { ArticleExtractor } from '../../domain/ports'
import type { CanonicalSpan, ExtractedSource, SpanKind } from '../../domain/types'
import { fetchPublicUrl } from '../dns/public-address'

type ReadabilityDocument = ConstructorParameters<typeof Readability>[0]

type ReadabilityElement = ReturnType<ReadabilityDocument['querySelectorAll']>[number]

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, tr'
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

const CODE_NOISE =
  '.language-id, .meta-line, .popover, .playground-link, .error, .error-behind, button'

const PROMO_NAME =
  /(^|[-_\s])(cta|promo|promotion|newsletter|subscribe|advert|advertisement|ads?|sponsor|sponsored)([-_\s]|$)/i
const MAX_PROMO_CHARS = 600

export function createReadabilityArticleExtractor(): ArticleExtractor {
  return {
    async extract(url: string): Promise<ExtractedSource> {
      const response = await fetchPublicUrl(url)
      if (!response.ok) {
        throw new DomainError('extraction_failed', `The article URL returned ${response.status}.`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('html')) {
        throw new DomainError('extraction_failed', `The URL serves ${contentType || 'no'} content.`)
      }

      return extractFromHtml(await readHtmlWithin(response, MAX_HTML_BYTES), url)
    },
  }
}

const MAX_HTML_BYTES = 5 * 1024 * 1024

export async function readHtmlWithin(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
    await response.body?.cancel()
    throw tooLarge(maxBytes)
  }
  if (response.body === null) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel()
      throw tooLarge(maxBytes)
    }
    html += decoder.decode(value, { stream: true })
  }
  return html + decoder.decode()
}

function tooLarge(maxBytes: number) {
  return new DomainError(
    'extraction_failed',
    `The page is larger than ${maxBytes / (1024 * 1024)} MB of HTML.`,
  )
}

export function extractFromHtml(html: string, url: string): ExtractedSource {
  const { document } = parseHTML(html)
  for (const link of document.querySelectorAll('a')) {
    if (link.textContent?.trim() === '') link.remove()
  }
  for (const element of document.querySelectorAll('[class], [id]')) {
    if (isPromo(element)) element.remove()
  }
  for (const pre of document.querySelectorAll('pre')) {
    pre.textContent = codeText(pre)
  }
  const article = new Readability(document as ReadabilityDocument).parse()
  if (!article) {
    throw new DomainError('extraction_failed', `No article content was found at ${url}.`)
  }

  const blocks = [...parseHTML(article.content).document.querySelectorAll(BLOCK_SELECTOR)]
    .filter((element) => element.querySelector(BLOCK_SELECTOR) === null)
    .map((element) => toBlock(element))
    .filter((block) => block.text.length > 0)

  if (blocks.length === 0) {
    throw new DomainError('extraction_failed', `The article at ${url} has no text.`)
  }

  const spans: CanonicalSpan[] = []
  let charStart = 0
  for (const [ordinal, { kind, text }] of blocks.entries()) {
    spans.push({
      ordinal,
      kind,
      text,
      charStart,
      charEnd: charStart + text.length,
      startMs: null,
      endMs: null,
    })
    charStart += text.length + 2
  }

  return {
    sourceType: 'article',
    title: article.title ? withoutSiteName(article.title, url) : null,
    channel: null,
    lengthMs: null,
    text: blocks.map((block) => block.text).join('\n\n'),
    spans,
  }
}

const TITLE_SEPARATOR = / [|—–-] /g
const MAX_SITE_SUFFIX_CHARS = 50

function withoutSiteName(title: string, url: string): string {
  const siteWords = new URL(url).hostname
    .toLowerCase()
    .split('.')
    .slice(0, -1)
    .filter((label) => label !== 'www')
  for (const separator of title.matchAll(TITLE_SEPARATOR)) {
    const suffix = title.slice(separator.index + separator[0].length)
    const words = suffix.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    if (
      separator.index > 0 &&
      suffix.length <= MAX_SITE_SUFFIX_CHARS &&
      siteWords.some((site) => words.includes(site))
    ) {
      return title.slice(0, separator.index).trim()
    }
  }
  return title
}

function toBlock(element: ReadabilityElement): { kind: SpanKind; text: string } {
  if (element.tagName === 'PRE') return { kind: 'code', text: element.textContent ?? '' }
  if (element.tagName === 'TR') return { kind: 'row', text: rowText(element) }
  return {
    kind: HEADING_TAGS.has(element.tagName) ? 'heading' : 'text',
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
  }
}

function isPromo(element: ReadabilityElement): boolean {
  const names = `${element.getAttribute('class') ?? ''} ${element.id}`.replace(
    /([a-z])([A-Z])/g,
    '$1-$2',
  )
  return PROMO_NAME.test(names) && (element.textContent?.length ?? 0) <= MAX_PROMO_CHARS
}

function codeText(pre: ReadabilityElement): string {
  for (const noise of pre.querySelectorAll(CODE_NOISE)) noise.remove()
  for (const lineBreak of pre.querySelectorAll('br')) lineBreak.replaceWith('\n')
  for (const line of pre.querySelectorAll('div, p')) line.append('\n')
  const text: string = pre.textContent ?? ''
  const lines = text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
  while (lines[0] === '') lines.shift()
  while (lines.at(-1) === '') lines.pop()
  return lines.join('\n')
}

function rowText(row: ReadabilityElement): string {
  const cellsOf = (element: ReadabilityElement) =>
    [...element.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim() ?? '')
  const first = row.closest('table')?.querySelector('tr')
  const header =
    first && [...first.children].every((cell) => cell.tagName === 'TH') ? cellsOf(first) : null
  if (row === first && header !== null) return ''

  const cells = cellsOf(row)
  if (header === null || header.length !== cells.length) {
    return cells.filter((cell) => cell !== '').join(' | ')
  }
  return cells
    .map((cell, column) => (cell === '' ? '' : `${header[column]}: ${cell}`))
    .filter((pair) => pair !== '')
    .join('; ')
}
