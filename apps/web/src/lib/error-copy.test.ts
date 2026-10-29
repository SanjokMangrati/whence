import { describe, expect, it } from 'vitest'
import { errorCopy } from './error-copy'

describe('failed source copy', () => {
  it('says a failed source does not count when its slot returned', () => {
    expect(errorCopy('generation_failed', 'free').body).toBe(
      'They stopped before they were finished. A source that fails does not count.',
    )
  })

  it('says the source counts, with the monthly returns, when it kept its slot', () => {
    expect(errorCopy('extraction_failed', 'free', true).body).toBe(
      'The page may be blocked or empty. Try again, or paste another link. This one counts toward your month. Free gives back 3 failed sources a month. Pro gives back 20.',
    )
  })

  it('counts a demo source toward the account, not the month', () => {
    expect(errorCopy('extraction_failed', 'demo', true).body).toBe(
      "The page may be blocked or empty. Try again, or paste another link. This one counts toward the demo's 3 sources. The demo gives back 3 failed sources.",
    )
  })

  it('says nothing about the slot for a refusal that returned it', () => {
    expect(errorCopy('verification_failed', 'free').body).toBe(
      'Try a longer or more detailed source.',
    )
  })

  it('states the limit of the plan that refused the source', () => {
    expect(errorCopy('quota_exceeded', 'demo').body).toBe('The demo account takes 3 sources.')
    expect(errorCopy('source_too_long', 'free').body).toBe(
      'Free takes up to 30 minutes. Pro takes up to 90.',
    )
  })
})
