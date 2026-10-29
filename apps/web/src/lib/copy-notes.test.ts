import { describe, expect, it } from 'vitest'
import { notesForClipboard } from './copy-notes'
import { parseNotes } from 'notes-format'

const ordinal = (value: number) => value

const MARKDOWN =
  '## Why spacing works\n- Spacing improves recall.[^1][^2]\n  - A week gap beat one sitting.[^3]\n' +
  '- Rest <helps> & sleep too.[^4]\n\n1. Review.[^5]\n2. Wait.[^6]\n\n' +
  '## Methods\n\n|  | Timing | Recall |\n| --- | --- | --- |\n' +
  '| Spaced | spread over time[^7] | better[^8] |\n| Massed | one sitting[^9] |  |'

describe('notesForClipboard', () => {
  it('writes plain text with the words only', () => {
    const [spacing, methods] = parseNotes(MARKDOWN, ordinal)

    expect(notesForClipboard([spacing!]).text).toBe(
      'Why spacing works\n\n' +
        '- Spacing improves recall.\n  - A week gap beat one sitting.\n- Rest <helps> & sleep too.\n\n' +
        '1. Review.\n2. Wait.',
    )
    expect(notesForClipboard([methods!]).text).toBe(
      'Methods\n\n- Spaced: Timing: spread over time; Recall: better\n- Massed: Timing: one sitting',
    )
  })

  it('joins every section for a whole copy', () => {
    const { text } = notesForClipboard(parseNotes(MARKDOWN, ordinal))

    expect(text.startsWith('Why spacing works\n\n')).toBe(true)
    expect(text).toContain('2. Wait.\n\nMethods\n\n- Spaced:')
  })

  it('writes HTML with headings, nested lists, and escaped text', () => {
    const [section] = parseNotes(MARKDOWN, ordinal)
    const { html } = notesForClipboard([section!])

    expect(html).toBe(
      '<h2>Why spacing works</h2>' +
        '<ul><li>Spacing improves recall.<ul><li>A week gap beat one sitting.</li></ul></li>' +
        '<li>Rest &lt;helps&gt; &amp; sleep too.</li></ul>' +
        '<ol><li>Review.</li><li>Wait.</li></ol>',
    )
  })

  it('keeps an empty table cell empty in HTML', () => {
    const [, methods] = parseNotes(MARKDOWN, ordinal)
    const { html } = notesForClipboard([methods!])

    expect(html).toContain('<tr><th>Massed</th><td>one sitting</td><td></td></tr>')
  })

  it('writes code as code in HTML and keeps the backticks in plain text', () => {
    const sections = parseNotes('- Narrow with `typeof x === "string"` first.[^1]', ordinal)
    const { text, html } = notesForClipboard(sections)

    expect(text).toBe('- Narrow with `typeof x === "string"` first.')
    expect(html).toBe(
      '<ul><li>Narrow with <code>typeof x === &quot;string&quot;</code> first.</li></ul>',
    )
  })
})
