'use client'

import { timestamp } from 'notes-format'
import { specimen, stripNotes } from '@/app/(site)/specimen'
import { useInView } from '@/lib/in-view'

const litId = stripNotes[0]!.line.citations[0]!.spanId
const LINES = 22
const sorted = [...specimen.spans].sort((a, b) => a.ordinal - b.ordinal)
const start = Math.max(
  0,
  Math.min(sorted.findIndex((span) => span.id === litId) - 4, sorted.length - LINES),
)
const lines = sorted.slice(start, start + LINES)
const half = Math.ceil(lines.length / 2)

export function SourceMargin() {
  const [root, inView] = useInView<HTMLDivElement>(30)
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-36 hidden items-start justify-between px-8 select-none min-[1360px]:flex"
    >
      {[lines.slice(0, half), lines.slice(half)].map((column, index) => (
        <ol key={index} className="grid w-[280px] gap-2.5">
          {column.map((span) => (
            <li key={span.id} className="mono flex gap-4 overflow-hidden text-xs text-ink-4">
              <span className="shrink-0">{timestamp(span.startMs)}</span>
              <span className="truncate">
                <span
                  className={`highlight ${span.id === litId && inView ? 'text-ink-2' : ''}`}
                  data-lit={(span.id === litId && inView) || undefined}
                >
                  {span.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ))}
    </div>
  )
}
