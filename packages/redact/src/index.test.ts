import { describe, expect, it } from 'vitest'
import { redact } from './index'

describe('redact', () => {
  it('replaces URLs and emails in the message and stack', () => {
    const error = new TypeError(
      'No article content was found at https://site.test/a?b=1 for me@mail.test.',
    )

    const copy = redact(error)

    expect(copy.name).toBe('TypeError')
    expect(copy.message).toBe('No article content was found at [url] for [email].')
    expect(copy.stack).not.toContain('site.test')
    expect(copy.stack).not.toContain('me@mail.test')
  })

  it('wraps a thrown value that is not an error', () => {
    expect(redact('failed for me@mail.test').message).toBe('failed for [email]')
  })
})
