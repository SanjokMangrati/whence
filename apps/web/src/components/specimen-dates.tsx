'use client'

import { useEffect, useRef, useState } from 'react'
import { Journey } from './journey'
import { Tag } from './tag'
import { reviewDates } from '@/app/(site)/specimen'
import { shortDate } from '@/lib/format'
import { clamp, prefersReducedMotion } from '@/lib/in-view'
import { useToday } from '@/lib/today'

function BackTag({ date }: { date: string | undefined }) {
  return (
    <Tag tone="schedule">
      Back <span className={date === undefined ? 'invisible' : undefined}>{date ?? 'OCT 00'}</span>
    </Tag>
  )
}

const SCROLL_FROM = 0.85
const SCROLL_TO = 0.4

export function SpecimenTimeline() {
  const today = useToday()
  const figure = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const element = figure.current
    if (element === null) return
    const still = prefersReducedMotion()
    let frame = 0

    function follow() {
      frame = 0
      const view = window.innerHeight
      const { top } = element!.getBoundingClientRect()
      const travelled = (view * SCROLL_FROM - top) / (view * (SCROLL_FROM - SCROLL_TO))
      setProgress(still ? 1 : clamp(travelled))
    }

    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(follow)
    }

    follow()
    if (still) return
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <figure ref={figure} className="m-0 grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="mono-label text-ink-3">Review dates</figcaption>
        <BackTag date={today === null ? undefined : shortDate(reviewDates(today)[0]!)} />
      </div>
      {today === null ? (
        <div className="aspect-[1000/260]" />
      ) : (
        <Journey dates={reviewDates(today)} progress={progress} />
      )}
    </figure>
  )
}
