'use client'

import { markerLabel, splitTerm } from 'notes-format'
import { useState } from 'react'
import { FactEntry, MarkedText, ShowFact } from './note-entry'
import { specimenSheet } from '@/app/(site)/specimen'
import { prefersReducedMotion, useInView } from '@/lib/in-view'
import { toPassages } from '@/lib/passages'

const entries = specimenSheet.blocks.flatMap((block) => (block.kind === 'entry' ? [block] : []))

export function SpecimenSheet() {
  const [picked, setPicked] = useState<ReadonlySet<number> | null>(null)
  const [root, inView] = useInView<HTMLDivElement>(40)
  const shown = picked ?? new Set(inView && !prefersReducedMotion() ? [0] : [])
  const allShown = shown.size === entries.length

  return (
    <div ref={root} className="grid rounded-md bg-card px-5 pt-5 pb-2 shadow-float sm:px-8 sm:pt-6">
      <div className="flex items-center justify-between gap-3 pb-3">
        <h3 className="display-s">{specimenSheet.heading}</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            setPicked(allShown ? new Set() : new Set(entries.map((_, index) => index)))
          }
        >
          {allShown ? 'Hide all facts' : 'Show all facts'}
        </button>
      </div>
      <ul>
        {entries.map((entry, index) => {
          const { term, fact } = splitTerm(entry.line.text)
          return (
            <FactEntry
              key={index}
              index={index}
              term={term}
              fact={
                shown.has(index) ? (
                  <span className="animate-fade">
                    <MarkedText text={fact}>
                      {toPassages(entry.line.citations).map((passage) => (
                        <a key={passage.key} href="#check" className="chip">
                          {markerLabel(passage.first)}
                        </a>
                      ))}
                    </MarkedText>
                  </span>
                ) : (
                  <ShowFact term={term} onShow={() => setPicked(new Set(shown).add(index))} />
                )
              }
              details={[]}
            />
          )
        })}
      </ul>
    </div>
  )
}
