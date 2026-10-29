import { describe, expect, it } from 'vitest'
import { DomainError } from '../../domain/errors'
import { stubFetch } from '../../test/fetch'
import {
  createReadabilityArticleExtractor,
  extractFromHtml,
  readHtmlWithin,
} from './article-extractor'

const ARTICLE_HTML = `<!doctype html>
<html><head><title>Spaced repetition works</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <article>
    <h1>Spaced repetition works</h1>
    <p>Recall improves when reviews are spread over time.</p>
    <p>The interval grows after each successful review.</p>
    <ul><li>Again resets the interval.</li><li>Easy lengthens it.</li></ul>
  </article>
  <footer><p>Copyright</p></footer>
</body></html>`

const GUIDE_HTML = `<!doctype html>
<html><head><title>Open source LLMs</title></head>
<body><main><div>
  <p>Running your own language models is all about avoiding API costs and taking control of your AI infrastructure. This guide shows you exactly how to select, deploy, and scale open source LLMs for production use.</p>
  <div><a href="#best-small-model"><div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0"></path></svg></div></a><h3 id="best-small-model">Best small model: Phi 3 Mini</h3></div>
  <p>An open source Large Language Model (LLM) is a neural network trained for natural language processing tasks whose model weights, architecture specifications, and often training code are freely available for download and use. Unlike proprietary models accessed through APIs (like GPT-4 or Claude), open source LLMs can be:</p>
  <ul>
    <li><strong>Parameters</strong>: 3.8B</li>
    <li><strong>Strengths</strong>: Runs on consumer GPUs, fast inference</li>
  </ul>
  <table><thead><tr><th>Model</th><th>Size</th><th>MMLU score</th></tr></thead>
  <tbody><tr><td>Qwen 3 32B</td><td>32B</td><td>82.3</td></tr><tr><td>Phi 3 Mini</td><td>3.8B</td><td></td></tr></tbody></table>
  <table><tr><td>Spot instances</td><td>60 to 90 percent cheaper</td></tr></table>
</div></main></body></html>`

const DOCS_HTML = `<!doctype html>
<html><head><title>TypeScript for JavaScript Programmers</title></head>
<body><article>
  <h1>TypeScript for JavaScript Programmers</h1>
  <p>TypeScript stands in an unusual relationship to JavaScript. TypeScript offers all of JavaScript's features, and an additional layer on top of these: TypeScript's type system.</p>
  <h2 id="types-by-inference">Types by Inference</h2>
  <p>TypeScript knows the JavaScript language and will generate types for you in many cases. For example in creating a variable and assigning it to a particular value, TypeScript will use the value as its type.</p>
  <pre class="shiki light-plus twoslash lsp"><div class="language-id">ts</div><div class='code-container'><code><div class='line'><span>interface</span><span> </span><span><data-lsp lsp='interface User'>User</data-lsp></span><span> {</span></div><div class='line'><span>  </span><span>name</span><span>: string;</span></div><div class='line'>&nbsp;</div><div class='line'><span>  </span><span>id</span><span>: number;</span></div><div class='meta-line'><span class='popover-prefix'>  </span><span class='popover'><div class='arrow'></div>(property) User.id: number</span></div><div class='line'><span>}</span></div><span class="error"><span>Object literal may only specify known properties.</span><span class="code">2353</span></span><span class="error-behind">Object literal may only specify known properties.</span></code><a class='playground-link' href='https://www.typescriptlang.org/play'>Try</a></div></pre>
  <p>By understanding how JavaScript works, TypeScript can build a type-system that accepts JavaScript code but has types. This offers a type-system without needing to add extra characters to make types explicit in your code.</p>
</article></body></html>`

const PROMO_HTML = `<!doctype html>
<html><head><title>Understanding garbage collection</title></head>
<body><article><div class="blog-body article-body">
  <p>Every time a program runs, memory allocation, tracking, and reclamation occur behind the scenes. Effectively managing this process can distinguish a high-performing application from a sluggish one.</p>
  <div class="_ctaSection_gy153_8 article-embedded-cta-section"><h4 class="_title_gy153_64">Webinar: Achieving cache-level performance without storing data in RAM</h4><p>Want to know how you can revolutionize data processing?</p><a href="/webinar">Watch now</a></div>
  <p>Efficient memory management affects application performance, reliability, and scalability. Whether developing a database, web application, or real-time system, understanding GC strategies and implementation is essential.</p>
  <div id="newsletter"><p>Subscribe for weekly posts about databases.</p></div>
</div></article></body></html>`

describe('readability article extractor', () => {
  it('keeps a code block whole, line by line, without the highlighter labels', () => {
    const spans = extractFromHtml(DOCS_HTML, 'https://example.com/docs').spans
    const code = spans.filter((span) => span.kind === 'code')

    expect(code.map((span) => span.text)).toEqual([
      'interface User {\n  name: string;\n\n  id: number;\n}',
    ])
    expect(spans.some((span) => span.text === 'ts')).toBe(false)
    expect(spans.some((span) => span.text.includes('(property)'))).toBe(false)
    expect(spans.some((span) => span.text.includes('Object literal'))).toBe(false)
    expect(spans.some((span) => span.text.includes('Try'))).toBe(false)
  })

  it('marks headings and keeps every other block as text', () => {
    const spans = extractFromHtml(DOCS_HTML, 'https://example.com/docs').spans

    expect(spans.filter((span) => span.kind === 'heading').map((span) => span.text)).toEqual([
      'Types by Inference',
    ])
    expect(
      spans.filter((span) => span.kind === 'text').every((span) => !span.text.includes('\n')),
    ).toBe(true)
  })

  it('removes promotion boxes that name themselves', () => {
    const texts = extractFromHtml(PROMO_HTML, 'https://example.com/blog').spans.map(
      (span) => span.text,
    )

    expect(texts).toHaveLength(2)
    expect(texts.join(' ')).not.toMatch(/Webinar|Watch now|Subscribe/)
  })

  it('returns ordered spans whose character ranges index into the text', () => {
    const source = extractFromHtml(ARTICLE_HTML, 'https://example.com/post')

    expect(source.sourceType).toBe('article')
    expect(source.title).toBe('Spaced repetition works')
    expect(source.lengthMs).toBeNull()
    expect(source.spans.map((span) => span.ordinal)).toEqual([...source.spans.keys()])
    expect(source.spans.map((span) => span.text)).toContain('Again resets the interval.')

    for (const span of source.spans) {
      expect(source.text.slice(span.charStart, span.charEnd)).toBe(span.text)
      expect(span.startMs).toBeNull()
      expect(span.endMs).toBeNull()
    }
  })

  it('keeps a heading that sits next to an icon link', () => {
    const texts = extractFromHtml(GUIDE_HTML, 'https://example.com/guide').spans.map(
      (span) => span.text,
    )

    expect(texts).toContain('Best small model: Phi 3 Mini')
    expect(texts.indexOf('Best small model: Phi 3 Mini')).toBeLessThan(
      texts.indexOf('Parameters: 3.8B'),
    )
  })

  it('makes one span per table row and names the column of each cell', () => {
    const texts = extractFromHtml(GUIDE_HTML, 'https://example.com/guide').spans.map(
      (span) => span.text,
    )

    expect(texts).toContain('Model: Qwen 3 32B; Size: 32B; MMLU score: 82.3')
    expect(
      extractFromHtml(GUIDE_HTML, 'https://example.com/guide')
        .spans.filter((span) => span.text.startsWith('Model:'))
        .map((span) => span.kind),
    ).toEqual(['row', 'row'])
    expect(texts).toContain('Model: Phi 3 Mini; Size: 3.8B')
    expect(texts).toContain('Spot instances | 60 to 90 percent cheaper')
    expect(texts).not.toContain('Model | Size | MMLU score')
    expect(texts.some((text) => text.startsWith('ModelSize'))).toBe(false)
  })

  it('removes a site name suffix from the title', () => {
    const titled = (title: string, url: string) =>
      extractFromHtml(
        ARTICLE_HTML.replace('Spaced repetition works</title>', `${title}</title>`),
        url,
      ).title

    expect(
      titled(
        'Open source LLMs: The complete guide | Blog — Northflank',
        'https://northflank.com/blog/open-source-llms',
      ),
    ).toBe('Open source LLMs: The complete guide')
    expect(titled('Spaced repetition - A guide', 'https://www.example.com/post')).toBe(
      'Spaced repetition - A guide',
    )
  })

  it('fails when the page has no article text', () => {
    expect(() =>
      extractFromHtml('<html><body></body></html>', 'https://example.com/empty'),
    ).toThrow(DomainError)
  })
})

describe('readability article fetch', () => {
  const extractor = createReadabilityArticleExtractor()

  function servePage(page: Response) {
    return stubFetch((request) =>
      request.url.startsWith('https://cloudflare-dns.com/')
        ? Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] })
        : page,
    )
  }

  it('reads the article at a public address', async () => {
    servePage(
      new Response(ARTICLE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    )

    const source = await extractor.extract('https://example.com/post')

    expect(source.title).toBe('Spaced repetition works')
    expect(source.spans.map((span) => span.text)).toContain('Again resets the interval.')
  })

  it('refuses a page that is not HTML', async () => {
    servePage(Response.json({ title: 'not a page' }))

    await expect(extractor.extract('https://example.com/post')).rejects.toMatchObject({
      code: 'extraction_failed',
      message: 'The URL serves application/json content.',
    })
  })

  it('refuses a page that returns an error status', async () => {
    servePage(new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } }))

    await expect(extractor.extract('https://example.com/post')).rejects.toMatchObject({
      code: 'extraction_failed',
      message: 'The article URL returned 404.',
    })
  })
})

describe('article body limit', () => {
  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })
  }

  it('refuses a page whose declared length is over the limit, before reading it', async () => {
    let pulled = false
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true
        },
      },
      { highWaterMark: 0 },
    )
    const response = new Response(body, { headers: { 'content-length': '11' } })
    await expect(readHtmlWithin(response, 10)).rejects.toMatchObject({
      code: 'extraction_failed',
    })
    expect(pulled).toBe(false)
  })

  it('refuses a page with no length header once the body passes the limit', async () => {
    const chunk = new TextEncoder().encode('<p>12345</p>')
    const response = new Response(streamOf([chunk, chunk]))
    await expect(readHtmlWithin(response, chunk.byteLength + 1)).rejects.toMatchObject({
      code: 'extraction_failed',
    })
  })

  it('reads a page at the limit, with a character split across two chunks', async () => {
    const bytes = new TextEncoder().encode('<p>café</p>')
    const split = bytes.indexOf(0xc3) + 1
    const response = new Response(streamOf([bytes.slice(0, split), bytes.slice(split)]))
    expect(await readHtmlWithin(response, bytes.byteLength)).toBe('<p>café</p>')
  })
})
