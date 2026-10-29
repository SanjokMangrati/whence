import { Pilcrow, Play } from 'lucide-react'
import { groupAdjacent, passageLabel, type Anchor } from 'notes-format'
import { Icon } from './icon'
import type { LineKind } from './transcript-line'

type Quoted = Anchor & { id: string; spanKind?: LineKind; text: string }

export function Evidence({ citations }: { citations: Quoted[] }) {
  return groupAdjacent(citations).map((passage) => {
    const first = passage[0]!
    const last = passage.at(-1)!
    return (
      <figure key={first.id} className="m-0 grid gap-2.5 rounded-md bg-paper-2 p-[18px]">
        {passage.some((citation) => citation.spanKind === 'code') ? (
          <blockquote className="grid gap-2.5 text-ink-2">
            {passage.map((citation) => (
              <span
                key={citation.id}
                className={
                  citation.spanKind === 'code'
                    ? 'mono block scrollbar-hidden overflow-x-auto rounded-sm bg-card px-3 py-2.5 whitespace-pre'
                    : 'reading-m'
                }
              >
                <mark className="highlight text-inherit" data-lit>
                  {citation.text}
                </mark>
              </span>
            ))}
          </blockquote>
        ) : (
          <blockquote className="reading-m text-ink-2">
            &ldquo;
            <mark className="highlight text-inherit" data-lit>
              {passage.map((citation) => citation.text).join(' ')}
            </mark>
            &rdquo;
          </blockquote>
        )}
        <figcaption className="mono flex items-center gap-1.5 text-xs text-source">
          <Icon icon={first.startMs !== null ? Play : Pilcrow} size={12} strokeWidth={2} />
          {first.startMs !== null
            ? `Video at ${passageLabel(first, last)}`
            : `${first === last ? 'Paragraph' : 'Paragraphs'} ${passageLabel(first, last)}`}
        </figcaption>
      </figure>
    )
  })
}
