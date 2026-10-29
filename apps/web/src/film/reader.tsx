import {
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  FolderPlus,
  Play,
  Trash2,
} from 'lucide-react'
import { markerLabel, splitTerm, timestamp } from 'notes-format'
import { useLayoutEffect, useRef, useState } from 'react'
import { AppHeader } from './home'
import { job, noteEntries, openedPassage, QUESTION_COUNT, sheetEntries } from './job'
import { Icon } from '@/components/icon'
import { FactEntry, MarkedText, NoteEntry, ShowFact } from '@/components/note-entry'
import { SourceChip } from '@/components/source-chip'
import { TranscriptLine } from '@/components/transcript-line'
import { chipDescription, toPassages } from '@/lib/passages'

type Line = (typeof noteEntries)[number]['line']

const TABS = [
  { label: 'Notes' },
  { label: 'Cheat sheet' },
  { label: 'Questions', count: QUESTION_COUNT },
]

const transcript = (() => {
  const spans = job.specimen.spans
  const first = spans.findIndex((span) => openedPassage.spanIds.includes(span.id))
  return spans.slice(first, first + 3)
})()
const litCount = transcript.filter((span) => openedPassage.spanIds.includes(span.id)).length

function TabRow({ tab }: { tab: number }) {
  const row = useRef<HTMLDivElement>(null)
  const [spots, setSpots] = useState<{ left: number; width: number }[]>([])

  useLayoutEffect(() => {
    function measure() {
      const tabs = row.current?.querySelectorAll<HTMLElement>('[data-tab]') ?? []
      setSpots([...tabs].map((node) => ({ left: node.offsetLeft, width: node.offsetWidth })))
    }
    measure()
    void document.fonts.ready.then(measure)
  }, [])

  const from = spots[Math.floor(tab)]
  const to = spots[Math.ceil(tab)]
  const share = tab - Math.floor(tab)
  return (
    <div ref={row} className="relative flex gap-7 border-b border-line pr-10">
      {TABS.map((item, index) => (
        <span
          key={item.label}
          data-tab
          data-anchor={index === 1 ? 'sheet-tab' : undefined}
          className={`ui-m inline-flex items-center gap-2 pb-3 font-medium ${Math.round(tab) === index ? 'text-ink' : 'text-ink-3'}`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="mono text-xs text-ink-3">{item.count}</span>
          )}
        </span>
      ))}
      {from !== undefined && to !== undefined && (
        <span
          className="absolute -bottom-px h-0.5 bg-ink"
          style={{
            left: from.left + (to.left - from.left) * share,
            width: from.width + (to.width - from.width) * share,
          }}
        />
      )}
    </div>
  )
}

export function ReaderScreen({
  opened,
  tab,
  shownFacts,
  sheetFrom,
}: {
  opened: boolean
  tab: number
  shownFacts: number
  sheetFrom: (index: number) => { opacity: number; translate: string }
}) {
  const chips = (line: Line, first: boolean) =>
    toPassages(line.citations).map((passage) => {
      const isOpened = first && passage.key === openedPassage.key
      return (
        <span key={passage.key} data-anchor={isOpened ? 'marker' : undefined}>
          <SourceChip
            label={markerLabel(passage.first)}
            description={chipDescription(passage)}
            active={opened && isOpened}
            onClick={() => {}}
          />
        </span>
      )
    })

  const line = (span: (typeof transcript)[number]) => (
    <TranscriptLine
      key={span.id}
      id={`film-span-${span.id}`}
      time={timestamp(span.startMs)}
      text={span.text}
      lit={opened && openedPassage.spanIds.includes(span.id)}
    />
  )

  return (
    <>
      <AppHeader due={0} />
      <main className="grid content-start gap-7 px-8 pt-8">
        <header className="grid gap-3.5">
          <span className="btn btn-ghost btn-sm -ml-3 justify-self-start">
            <Icon icon={ArrowLeft} size={15} />
            Home
          </span>
          <div className="grid gap-6">
            <div className="grid min-w-0 gap-4">
              <div className="flex items-center gap-2">
                <span className="mono-label inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap text-source shadow-[inset_0_0_0_1px_var(--color-source-line)]">
                  Source
                  <Icon icon={ExternalLink} size={11} strokeWidth={2} />
                </span>
              </div>
              <h1 className="display-l">{job.title}</h1>
            </div>
            <div className="flex items-center gap-1 justify-self-end">
              {[FolderPlus, Download, Trash2].map((icon, index) => (
                <span key={index} className="btn btn-ghost w-10 px-0">
                  <Icon icon={icon} />
                </span>
              ))}
              <span className="btn btn-primary ml-2">
                Start quiz
                <Icon icon={ArrowRight} size={17} />
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-16">
          <section className="grid">
            <div data-focus="video" className="grid gap-4">
              <div className="relative grid aspect-video place-items-center rounded-lg bg-ink text-paper">
                <Icon icon={Play} />
                <span className="mono-label absolute bottom-3 left-3.5">
                  {opened
                    ? `Playing from ${markerLabel(openedPassage.first)}`
                    : `${job.title} · ${job.length}`}
                </span>
              </div>
              <ol className="film-sweep">{transcript.slice(0, litCount).map(line)}</ol>
            </div>
            <ol>{transcript.slice(litCount).map(line)}</ol>
          </section>

          <section data-focus="panel" className="grid min-h-[462px] min-w-0 content-start gap-7">
            <TabRow tab={tab} />
            {tab < 0.5 ? (
              <div className="grid">
                <h2 className="display-s pb-3">{job.notes.heading}</h2>
                <ul>
                  {noteEntries.slice(0, 3).map((entry, index) => (
                    <NoteEntry
                      key={index}
                      index={index}
                      point={
                        <MarkedText text={entry.line.text}>
                          {chips(entry.line, index === 0)}
                        </MarkedText>
                      }
                      details={[]}
                      steps={[]}
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="grid">
                <div className="flex items-center justify-between gap-3 pb-3">
                  <h2 className="display-s">{job.sheet.heading}</h2>
                  <span className="btn btn-secondary btn-sm">Show all facts</span>
                </div>
                <div>
                  {sheetEntries.map((entry, index) => {
                    const { term, fact } = splitTerm(entry.line.text)
                    return (
                      <ul key={index} style={sheetFrom(index)}>
                        <FactEntry
                          index={index}
                          term={term}
                          details={[]}
                          fact={
                            index < shownFacts ? (
                              <MarkedText text={fact}>{chips(entry.line, false)}</MarkedText>
                            ) : (
                              <span data-anchor={`show-${index}`} className="inline-block">
                                <ShowFact term={term} onShow={() => {}} />
                              </span>
                            )
                          }
                        />
                      </ul>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
