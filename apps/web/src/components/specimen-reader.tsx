'use client'

import { Play } from 'lucide-react'
import Image from 'next/image'
import { markerLabel } from 'notes-format'
import { useRef, useState } from 'react'
import { Icon } from './icon'
import { MarkedText, NoteEntry } from './note-entry'
import { SourceChip } from './source-chip'
import {
  readerNotes,
  specimen,
  specimenCredit,
  specimenLicense,
  specimenNotes,
  specimenTitle,
} from '@/app/(site)/specimen'
import { track } from '@/lib/analytics'
import { prefersReducedMotion, useInView } from '@/lib/in-view'
import { chipDescription, toPassages, type Passage } from '@/lib/passages'
import { seekPlayer, youtubeVideoId } from '@/lib/youtube'

const videoId = youtubeVideoId(specimen.source.url)!
const notePassages = readerNotes.map((note) => toPassages(note.line.citations))
const demo = notePassages[0]!.at(-1)!.key

export function SpecimenReader() {
  const [picked, setPicked] = useState<string | null>(null)
  const [startAt, setStartAt] = useState<number | null>(null)
  const player = useRef<HTMLIFrameElement>(null)
  const [root, inView] = useInView<HTMLDivElement>(40)
  const selected = picked ?? (inView && !prefersReducedMotion() ? demo : null)

  function play(seconds: number) {
    if (startAt === null) setStartAt(seconds)
    else seekPlayer(player.current, seconds)
  }

  function open(passage: Passage) {
    track('specimen_marker_clicked', {})
    setPicked(passage.key)
    if (passage.first.startMs !== null) play(Math.floor(passage.first.startMs / 1000))
  }

  return (
    <div
      ref={root}
      className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16"
    >
      <div className="grid min-w-0 content-start gap-4">
        {startAt === null ? (
          <button
            type="button"
            onClick={() => play(0)}
            className="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-ink"
            aria-label={`Play ${specimenTitle}`}
          >
            <Image
              src={`/specimen/${videoId}.jpg`}
              alt=""
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="btn btn-primary btn-lg w-12 px-0 group-hover:bg-ink-2">
                <Icon icon={Play} size={20} />
              </span>
            </span>
          </button>
        ) : (
          <iframe
            ref={player}
            title={specimen.source.title}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&start=${startAt}`}
            className="aspect-video w-full rounded-lg border-0 bg-ink"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        )}
        <div className="grid gap-0.5">
          <p className="ui-m font-medium">{specimenTitle}</p>
          <p className="ui-s text-ink-3">
            {specimenCredit},{' '}
            <a href={specimen.source.url} target="_blank" rel="noreferrer" className="link">
              YouTube
            </a>
            ,{' '}
            <a href={specimenLicense.url} target="_blank" rel="noreferrer" className="link">
              {specimenLicense.name}
            </a>
          </p>
        </div>
      </div>

      <article className="grid min-w-0 content-start gap-2">
        <h3 className="display-s pb-3">{specimenNotes.heading}</h3>
        <ul>
          {readerNotes.map((note, index) => (
            <NoteEntry
              key={index}
              index={index}
              point={
                <MarkedText text={note.line.text}>
                  {notePassages[index]!.map((passage) => (
                    <SourceChip
                      key={passage.key}
                      label={markerLabel(passage.first)}
                      description={chipDescription(passage)}
                      active={selected === passage.key}
                      onClick={() => open(passage)}
                    />
                  ))}
                </MarkedText>
              }
              details={[]}
              steps={[]}
            />
          ))}
        </ul>
      </article>
    </div>
  )
}
