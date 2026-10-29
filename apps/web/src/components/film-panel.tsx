'use client'

import type { PlayerRef } from '@remotion/player'
import { Play, RotateCcw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icon'
import { RevealGroup } from './reveal-group'
import { CHAPTERS, chapterAt, DURATION } from '@/film/timeline'
import { clamp, prefersReducedMotion, useInView, useOnScreen } from '@/lib/in-view'
import { useToday } from '@/lib/today'

const FilmPlayer = dynamic(() => import('./film-player'), { ssr: false })

const PLAYS = 3

export function FilmPanel() {
  const [band, inView] = useInView<HTMLElement>(30)
  const onScreen = useOnScreen(band)
  const player = useRef<PlayerRef>(null)
  const plays = useRef(0)
  const [ready, setReady] = useState(false)
  const [waiting, setWaiting] = useState<'start' | 'again' | null>(null)
  const [ends, setEnds] = useState(0)
  const [frame, setFrame] = useState(0)
  const today = useToday()

  useEffect(() => {
    const current = player.current
    if (!ready || waiting !== null || current === null) return
    if (onScreen) current.play()
    else current.pause()
  }, [ready, waiting, onScreen])

  useEffect(() => {
    const current = player.current
    if (ends === 0 || current === null) return
    plays.current += 1
    if (plays.current < PLAYS) {
      current.seekTo(0)
      current.play()
    } else setWaiting('again')
  }, [ends])

  const chapter = chapterAt(frame)

  function onReady() {
    if (prefersReducedMotion()) {
      plays.current = PLAYS - 1
      setWaiting('start')
    }
    setReady(true)
  }

  function playFrom(from: number) {
    const current = player.current
    if (current === null) return
    current.pause()
    current.seekTo(from)
    current.play()
    setWaiting(null)
  }

  return (
    <section ref={band} id="how" className="scroll-mt-15 bg-ink text-paper">
      <RevealGroup className="mx-auto grid w-full max-w-page items-center gap-8 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <div className="reveal grid content-start gap-4">
          <h2 className="display-m sm:display-l text-balance">What you get from one link.</h2>
          <div role="group" aria-label="Chapters of the film" className="grid pt-2">
            {CHAPTERS.map((item, index) => {
              const on = index === chapter
              const end = CHAPTERS[index + 1]?.from ?? DURATION
              const fill = clamp((frame - item.from) / (end - item.from))
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => playFrom(item.from)}
                  className="group grid w-full cursor-pointer gap-2.5 border-t border-ink-2 py-[18px] text-left last:border-b focus-visible:outline-paper"
                >
                  <span
                    className={`mono-label transition-colors duration-120 ${on ? 'text-paper' : 'text-ink-4 group-hover:text-paper'}`}
                  >
                    {item.name}
                  </span>
                  {on && (
                    <>
                      <span className="ui-m animate-fade text-paper-3">{item.text}</span>
                      <span className="h-0.5 rounded-xs bg-ink-2">
                        <span
                          className="block h-0.5 rounded-xs bg-paper"
                          style={{ width: `${fill * 100}%` }}
                        />
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="reveal">
          <figure
            aria-label="A film with no sound: paste a link, check a line, answer a question, and see when it comes back"
            className="relative m-0 aspect-video overflow-hidden rounded-lg bg-paper"
          >
            {inView && today !== null && (
              <div aria-hidden="true" inert className="absolute inset-0">
                <FilmPlayer
                  player={player}
                  today={today}
                  onReady={onReady}
                  onFrame={setFrame}
                  onEnded={() => setEnds((count) => count + 1)}
                />
              </div>
            )}
            {waiting !== null && (
              <button
                type="button"
                onClick={() => playFrom(0)}
                aria-label={waiting === 'again' ? 'Play the film again' : 'Play the film'}
                title={waiting === 'again' ? 'Play the film again' : 'Play the film'}
                className="btn btn-secondary btn-sm absolute bottom-4 left-4 w-8 animate-fade px-0"
              >
                <Icon icon={waiting === 'again' ? RotateCcw : Play} size={16} />
              </button>
            )}
          </figure>
        </div>
      </RevealGroup>
    </section>
  )
}
