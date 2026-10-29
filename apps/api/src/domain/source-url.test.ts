import { describe, expect, it } from 'vitest'
import { normalizeSourceUrl } from './source-url'

describe('source url normalization', () => {
  it('reduces every YouTube link shape to one watch url', () => {
    const shapes = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=sharer',
    ]

    for (const shape of shapes) {
      expect(normalizeSourceUrl(shape)).toEqual({
        normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        sourceType: 'video',
      })
    }
  })

  it('drops tracking parameters and the trailing slash from an article key', () => {
    expect(
      normalizeSourceUrl('https://www.example.com/posts/recall/?utm_source=x&page=2').normalizedUrl,
    ).toBe('https://example.com/posts/recall?page=2')
  })

  it('fetches an article at its pasted host and path, without tracking or a fragment', () => {
    expect(
      normalizeSourceUrl('https://www.example.com/posts/recall/?utm_source=x&page=2#token=abc').url,
    ).toBe('https://www.example.com/posts/recall/?page=2')
    expect(normalizeSourceUrl('https://example.com/search?q=a%20b').url).toBe(
      'https://example.com/search?q=a%20b',
    )
  })

  it('rejects a source this product cannot extract', () => {
    for (const url of [
      'https://vimeo.com/12345',
      'https://player.vimeo.com/video/12345',
      'https://mobile.twitter.com/someone/status/1',
      'https://x.com/someone/status/1',
      'ftp://example.com/file.txt',
      'https://user:secret@example.com/post',
      'https://example.com:8080/post',
      'https://www.youtube.com/watch?v=short',
      'not a url',
    ]) {
      expect(() => normalizeSourceUrl(url)).toThrowError(
        expect.objectContaining({ code: 'unsupported_source' }),
      )
    }
  })
})
