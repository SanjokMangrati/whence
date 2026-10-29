'use client'

import { markerLabel, timestamp } from 'notes-format'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { MarkedText } from './note-entry'
import { SourceChip } from './source-chip'
import { TranscriptLine } from './transcript-line'
import { specimen, stripNotes } from '@/app/(site)/specimen'
import { clamp, prefersReducedMotion } from '@/lib/in-view'
import { toPassages } from '@/lib/passages'

const notePassages = stripNotes.map((note) => toPassages(note.line.citations))
const passages = notePassages.flat()
const spans = new Map(specimen.spans.map((span) => [span.id, span]))

const SCROLL_FROM = 0.8
const SCROLL_TO = 0.5
const THREAD_REACH = 22
const CORNER = 6

type Thread = { divider: number; from: number; to: number; toX: number }

export function SpecimenStrip() {
  const [picked, setPicked] = useState(passages[0]!.key)
  const root = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const touched = useRef(false)
  const thread = useThread(root, transcript, list, picked)

  useEffect(() => {
    const box = list.current
    const passage = passages.find((item) => item.key === picked)!
    const line = document.getElementById(`strip-span-${passage.spanIds[0]}`)
    if (box === null || line === null) return
    box.scrollTo({ top: line.offsetTop - 12, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [picked])

  useEffect(() => {
    const box = root.current
    if (box === null || prefersReducedMotion()) return
    let frame = 0

    function follow() {
      frame = 0
      if (touched.current) return
      const { top, height } = box!.getBoundingClientRect()
      const view = window.innerHeight
      const progress = (view * SCROLL_FROM - top) / (height + view * (SCROLL_FROM - SCROLL_TO))
      const index = Math.min(passages.length - 1, Math.floor(clamp(progress) * passages.length))
      setPicked(passages[index]!.key)
    }

    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(follow)
    }

    follow()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  function pick(key: string) {
    touched.current = true
    setPicked(key)
  }

  return (
    <div
      ref={root}
      className="relative grid overflow-hidden rounded-md bg-card text-left shadow-float lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <div ref={transcript} className="relative border-t border-line lg:border-t-0 lg:border-r">
        <div className="grid content-start gap-3 p-5 sm:p-8 lg:absolute lg:inset-0 lg:flex lg:flex-col">
          <p className="mono-label text-ink-3">Transcript</p>
          <ol
            ref={list}
            aria-label="Transcript lines for this note"
            className="scrollbar-hidden relative max-h-[260px] overflow-y-auto overscroll-contain sm:max-h-[360px] lg:max-h-none lg:min-h-0 lg:flex-1"
          >
            {passages.map((passage, index) => [
              index > 0 && (
                <li
                  key={`gap-${passage.key}`}
                  aria-hidden="true"
                  className="mono py-1 pl-16 text-ink-4"
                >
                  …
                </li>
              ),
              passage.spanIds.map((spanId) => {
                const span = spans.get(spanId)!
                return (
                  <TranscriptLine
                    key={spanId}
                    id={`strip-span-${spanId}`}
                    time={timestamp(span.startMs)}
                    text={span.text}
                    lit={passage.key === picked}
                  />
                )
              }),
            ])}
          </ol>
        </div>
      </div>

      <div className="order-first grid content-start gap-7 p-5 sm:p-8 lg:order-none">
        <div className="grid gap-3">
          <p className="mono-label text-ink-3">Notes</p>
          <ul className="grid gap-4">
            {stripNotes.map((note, index) => (
              <li key={index} className="reading-l">
                <MarkedText text={note.line.text}>
                  {notePassages[index]!.map((passage) => (
                    <SourceChip
                      key={passage.key}
                      label={markerLabel(passage.first)}
                      description={`Show the transcript at ${markerLabel(passage.first)}`}
                      active={passage.key === picked}
                      onClick={() => pick(passage.key)}
                    />
                  ))}
                </MarkedText>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 border-t border-line pt-6">
          <p className="mono-label text-ink-3">Question</p>
          <p className="display-s">{specimen.question.question}</p>
        </div>
      </div>

      {thread !== null && (
        <svg
          aria-hidden="true"
          className="thread pointer-events-none absolute inset-0 hidden size-full lg:block"
        >
          <path key={picked} pathLength={1} d={threadPath(thread)} />
          <circle cx={thread.divider + THREAD_REACH} cy={thread.from} r="2.5" />
          <circle key={`end-${picked}`} cx={thread.toX} cy={thread.to} r="2.5" />
        </svg>
      )}
    </div>
  )
}

function threadPath({ divider, from, to, toX }: Thread): string {
  const start = divider + THREAD_REACH
  const turn = Math.sign(to - from) * Math.min(CORNER, Math.abs(to - from) / 2)
  return [
    `M${start} ${from}`,
    `H${divider + CORNER}`,
    `Q${divider} ${from} ${divider} ${from + turn}`,
    `V${to - turn}`,
    `Q${divider} ${to} ${divider - CORNER} ${to}`,
    `H${toX}`,
  ].join(' ')
}

function useThread(
  root: RefObject<HTMLDivElement | null>,
  transcript: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLOListElement | null>,
  picked: string,
): Thread | null {
  const [thread, setThread] = useState<Thread | null>(null)

  useLayoutEffect(() => {
    const box = root.current
    const column = transcript.current
    const lines = list.current
    if (box === null || column === null || lines === null) return

    function measure() {
      const origin = box!.getBoundingClientRect()
      const chip = box!.querySelector('.chip[aria-pressed="true"]')
      const passage = passages.find((item) => item.key === picked)!
      const line = document
        .getElementById(`strip-span-${passage.spanIds[0]}`)
        ?.querySelector('.highlight')
        ?.getClientRects()[0]
      if (chip === null || line === undefined) return
      const view = lines!.getBoundingClientRect()
      if (line.bottom < view.top || line.top > view.bottom) {
        setThread(null)
        return
      }
      const marker = chip.getBoundingClientRect()
      const divider = column!.getBoundingClientRect().right - origin.left
      setThread({
        divider,
        from: marker.top + marker.height / 2 - origin.top,
        to: line.top + line.height / 2 - origin.top,
        toX: Math.min(line.right - origin.left + 8, divider - THREAD_REACH),
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    lines.addEventListener('scroll', measure, { passive: true })
    void document.fonts.ready.then(measure)
    return () => {
      observer.disconnect()
      lines.removeEventListener('scroll', measure)
    }
  }, [root, transcript, list, picked])

  return thread
}
