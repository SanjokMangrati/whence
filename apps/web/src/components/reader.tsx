'use client'

import * as Tabs from '@radix-ui/react-tabs'
import type { InferResponseType } from 'hono/client'
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  groupEntries,
  hostName,
  markerLabel,
  parseNotes,
  questionsFor,
  splitTerm,
  timestamp,
  type BlockGroup,
  type NoteLine,
} from 'notes-format'
import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './copy-button'
import { Icon } from './icon'
import {
  FactEntry,
  InlineText,
  MarkedText,
  NoteEntry,
  NoteSteps,
  SheetSteps,
  ShowFact,
} from './note-entry'
import { PreferenceSwitch } from './preference-switch'
import { ShortDate } from './short-date'
import { SourceChip } from './source-chip'
import { CollectionsMenu, DeleteSourceButton, ExportMenu } from './source-menus'
import { TabBar } from './tab-bar'
import { Tag } from './tag'
import { TranscriptLine } from './transcript-line'
import { track } from '@/lib/analytics'
import type { api } from '@/lib/api-client'
import { plural } from '@/lib/format'
import type { Plan } from '@/lib/plans'
import { notesForClipboard } from '@/lib/copy-notes'
import { chipDescription, toPassage, toPassages, type Passage } from '@/lib/passages'
import { usePreference } from '@/lib/preferences'
import { seekPlayer, youtubeVideoId } from '@/lib/youtube'

type Artifact = InferResponseType<(typeof api.artifacts)[':id']['$get'], 200>
type SourceText = InferResponseType<(typeof api.generations)[':id']['source']['$get'], 200>
type Question = InferResponseType<
  (typeof api.study.jobs)[':jobId']['questions']['$get'],
  200
>['items'][number]
type Citation = Artifact['citations'][number]
type Line = NoteLine<Citation>

const TAB_LABEL = { notes: 'Notes', cheat_sheet: 'Cheat sheet' } as const
const QUESTIONS_TAB = 'questions'

function sectionsOf(artifact: Artifact) {
  const byOrdinal = new Map(artifact.citations.map((citation) => [citation.ordinal, citation]))
  return parseNotes(artifact.markdown, (ordinal) => {
    const citation = byOrdinal.get(ordinal)
    if (citation === undefined) {
      throw new Error(`Artifact ${artifact.id} has marker ${ordinal + 1} with no citation.`)
    }
    return citation
  })
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function Reader({
  jobId,
  artifacts,
  source,
  questions,
  plan,
  collections,
}: {
  jobId: string
  artifacts: Artifact[]
  source: SourceText
  questions: Question[]
  plan: Plan
  collections: { id: string; name: string; jobIds: string[] }[]
}) {
  const [selected, setSelected] = useState<{
    line: string | null
    passage: Passage
  } | null>(null)
  const [tab, setTab] = useState(artifacts[0]!.id)
  const viewedType = artifacts.find((artifact) => artifact.id === tab)?.artifactType
  useEffect(() => {
    if (viewedType !== undefined) track('artifact_viewed', { artifact_type: viewedType })
  }, [viewedType])
  const [factsHidden, setFactsHidden] = useState(true)
  const [shownFacts, setShownFacts] = useState<ReadonlySet<string>>(new Set())
  const player = useRef<HTMLIFrameElement>(null)
  const sourceList = useRef<HTMLOListElement>(null)
  const isVideo = source.source.sourceType === 'video'
  const videoId = isVideo ? youtubeVideoId(source.source.url) : null
  const title = source.source.title ?? source.source.url
  const router = useRouter()
  const playOnClick = usePreference('play-on-click')
  const label = isVideo ? source.source.channel : hostName(source.source.url)

  function open(lineKey: string, passage: Passage) {
    setSelected({ line: lineKey, passage })
    const list = sourceList.current
    const line = document.getElementById(`span-${passage.spanIds[0]}`)
    if (list !== null && line !== null) {
      list.scrollTo({ top: line.offsetTop - 12, behavior: scrollBehavior() })
    }
    if (playOnClick && passage.first.startMs !== null) {
      seekPlayer(player.current, passage.first.startMs / 1000)
    }
  }

  const currentArtifact = artifacts.find((artifact) => artifact.id === tab)

  const tabs = [
    ...artifacts.map((artifact) => ({
      value: artifact.id,
      label: TAB_LABEL[artifact.artifactType],
    })),
    ...(questions.length > 0
      ? [{ value: QUESTIONS_TAB, label: 'Questions', count: questions.length }]
      : []),
  ]

  return (
    <main className="mx-auto grid w-full max-w-page content-start gap-7 px-4 pt-6 pb-24 sm:px-8 sm:pt-8">
      <header className="grid gap-3.5">
        <Link href="/" className="btn btn-ghost btn-sm -ml-3 justify-self-start">
          <Icon icon={ArrowLeft} size={15} />
          Home
        </Link>
        <div className="grid gap-6">
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {label !== null && <Tag>{label}</Tag>}
              <a
                href={source.source.url}
                target="_blank"
                rel="noreferrer"
                className="mono-label inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap text-source shadow-[inset_0_0_0_1px_var(--color-source-line)] transition-colors duration-120 hover:bg-source-wash"
              >
                Source
                <Icon icon={ExternalLink} size={11} strokeWidth={2} />
              </a>
            </div>
            <h1 className="display-m sm:display-l break-words">{title}</h1>
          </div>
          <div className="flex items-center gap-1 justify-self-end">
            <CollectionsMenu plan={plan} jobId={jobId} collections={collections} />
            <ExportMenu
              plan={plan}
              targets={artifacts.map((artifact) => ({
                id: artifact.id,
                label: TAB_LABEL[artifact.artifactType],
              }))}
            />
            <DeleteSourceButton
              jobId={jobId}
              title={title}
              outputs={[
                ...artifacts.map((artifact) => TAB_LABEL[artifact.artifactType].toLowerCase()),
                ...(questions.length > 0 ? ['questions'] : []),
              ]}
              onDeleted={() => {
                router.push('/')
                router.refresh()
              }}
            />
            {questions.length > 0 && (
              <Link href={`/study/${jobId}`} className="btn btn-primary ml-2">
                Start quiz
                <Icon icon={ArrowRight} size={17} />
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <section aria-label="Source" className="grid gap-4 lg:sticky lg:top-[84px]">
          {videoId !== null && (
            <iframe
              ref={player}
              title={title}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`}
              className="aspect-video w-full rounded-lg border-0 bg-ink"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          )}
          {videoId !== null && (
            <PreferenceSwitch name="play-on-click" size="s">
              Play the video from a timestamp
            </PreferenceSwitch>
          )}
          <ol
            ref={sourceList}
            aria-label={isVideo ? 'Transcript' : 'Article text'}
            className={`relative overflow-x-hidden overflow-y-auto overscroll-contain ${
              videoId !== null
                ? 'max-h-[260px] sm:max-h-[360px]'
                : 'max-h-[360px] lg:max-h-[calc(100dvh-120px)]'
            }`}
          >
            {source.spans.map((span) => {
              const startMs = span.startMs
              return (
                <TranscriptLine
                  key={span.id}
                  id={`span-${span.id}`}
                  time={startMs !== null ? timestamp(startMs) : `¶ ${span.ordinal + 1}`}
                  kind={span.kind}
                  text={span.text}
                  lit={selected?.passage.spanIds.includes(span.id) ?? false}
                  onPlay={
                    videoId !== null && startMs !== null
                      ? () => {
                          setSelected({
                            line: null,
                            passage: toPassage([
                              { ...span, spanId: span.id, spanOrdinal: span.ordinal },
                            ]),
                          })
                          seekPlayer(player.current, startMs / 1000)
                        }
                      : undefined
                  }
                />
              )
            })}
          </ol>
        </section>

        <section aria-label="Your notes" className="min-w-0">
          <Tabs.Root value={tab} onValueChange={setTab} className="grid gap-7">
            <TabBar label="Your notes" tabs={tabs} value={tab}>
              {currentArtifact !== undefined && (
                <CopyButton
                  key={currentArtifact.id}
                  label={`Copy the whole ${currentArtifact.artifactType === 'cheat_sheet' ? 'cheat sheet' : 'notes'}`}
                  content={() => notesForClipboard(sectionsOf(currentArtifact))}
                />
              )}
            </TabBar>
            {artifacts.map((artifact) => {
              const cheatSheet = artifact.artifactType === 'cheat_sheet'
              const sections = sectionsOf(artifact)
              const headed = sections.filter(
                (section): section is typeof section & { heading: string } =>
                  section.heading !== null,
              )
              const sectionId = (index: number) => `${artifact.id}-section-${index}`
              const hiding = cheatSheet && factsHidden

              const chips = (lineKey: string, line: Line) =>
                toPassages(line.citations).map((passage) => (
                  <SourceChip
                    key={passage.key}
                    label={markerLabel(passage.first)}
                    description={chipDescription(passage)}
                    active={selected?.line === lineKey && selected.passage.key === passage.key}
                    onClick={() => open(lineKey, passage)}
                  />
                ))

              const isHidden = (lineKey: string) => hiding && !shownFacts.has(lineKey)
              const withChips = (lineKey: string, line: Line, text = line.text) => {
                if (isHidden(lineKey)) {
                  return (
                    <ShowFact
                      term={splitTerm(line.text).term}
                      onShow={() => setShownFacts((shown) => new Set(shown).add(lineKey))}
                    />
                  )
                }
                return <MarkedText text={text}>{chips(lineKey, line)}</MarkedText>
              }

              const details = (lineKey: string, entryDetails: Line[]) =>
                entryDetails.map((detail, detailIndex) =>
                  withChips(`${lineKey}:detail:${detailIndex}`, detail),
                )

              const stepsUnder = (lineKey: string, next: BlockGroup<Citation> | undefined) =>
                next?.kind === 'steps'
                  ? next.steps.map((step, stepIndex) =>
                      withChips(`${lineKey}:step:${stepIndex}`, step),
                    )
                  : []

              const renderBlock = (
                group: BlockGroup<Citation>,
                blockKey: string,
                previous: BlockGroup<Citation> | undefined,
                next: BlockGroup<Citation> | undefined,
              ) => {
                switch (group.kind) {
                  case 'entries':
                    return (
                      <ul key={blockKey}>
                        {group.entries.map((entry, index) => {
                          const lineKey = `${blockKey}:${index}`
                          if (!cheatSheet) {
                            return (
                              <NoteEntry
                                key={lineKey}
                                index={index}
                                point={withChips(lineKey, entry.line)}
                                details={details(lineKey, entry.details)}
                                steps={
                                  index === group.entries.length - 1
                                    ? stepsUnder(lineKey, next)
                                    : []
                                }
                              />
                            )
                          }
                          const { term, fact } = splitTerm(entry.line.text)
                          return (
                            <FactEntry
                              key={lineKey}
                              index={index}
                              term={term}
                              fact={withChips(lineKey, entry.line, fact)}
                              details={details(lineKey, entry.details)}
                            />
                          )
                        })}
                      </ul>
                    )
                  case 'steps': {
                    if (!cheatSheet && previous?.kind === 'entries') return null
                    const steps = group.steps.map((step, index) =>
                      withChips(`${blockKey}:${index}`, step),
                    )
                    return cheatSheet ? (
                      <SheetSteps key={blockKey} apart={previous?.kind === 'steps'} steps={steps} />
                    ) : (
                      <div key={blockKey} className="pb-3">
                        <NoteSteps steps={steps} />
                      </div>
                    )
                  }
                  case 'table':
                    return (
                      <div key={blockKey} className="max-w-full overflow-x-auto">
                        <table className="ui-m w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-line-strong">
                              <td className={cheatSheet ? 'sm:w-50' : undefined} />
                              {group.columns.map((column) => (
                                <th key={column} scope="col" className="py-2 pr-6 font-medium">
                                  <InlineText text={column} />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-t border-line align-top">
                                <th scope="row" className="py-2 pr-6 font-medium">
                                  <InlineText text={row.label} />
                                </th>
                                {row.cells.map((cell, cellIndex) => {
                                  const lineKey = `${blockKey}:${rowIndex}:${cellIndex}`
                                  return (
                                    <td key={cellIndex} className="py-2 pr-6 text-ink-2">
                                      {cell !== null && withChips(lineKey, cell)}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                }
              }

              return (
                <Tabs.Content
                  key={artifact.id}
                  value={artifact.id}
                  className="grid animate-fade gap-12 outline-none"
                >
                  {cheatSheet && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm justify-self-start"
                      aria-pressed={factsHidden}
                      onClick={() => {
                        setFactsHidden(!factsHidden)
                        setShownFacts(new Set())
                      }}
                    >
                      {factsHidden ? 'Show all facts' : 'Hide all facts'}
                    </button>
                  )}
                  {!cheatSheet && headed.length > 1 && (
                    <nav aria-labelledby={`${artifact.id}-contents`} className="grid gap-3">
                      <h2 id={`${artifact.id}-contents`} className="mono-label text-ink-3">
                        In these notes
                      </h2>
                      <ol className="gap-x-8 sm:columns-2">
                        {headed.map((section, position) => (
                          <li key={position} className="break-inside-avoid border-t border-line">
                            <a
                              href={`#${sectionId(sections.indexOf(section))}`}
                              className="group grid grid-cols-[28px_minmax(0,1fr)] items-baseline py-2.5"
                            >
                              <span className="mono text-xs text-ink-4">
                                {String(position + 1).padStart(2, '0')}
                              </span>
                              <span className="ui-m text-ink-2 decoration-1 underline-offset-4 transition-colors duration-120 group-hover:text-ink group-hover:underline">
                                <InlineText text={section.heading} />
                              </span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    </nav>
                  )}
                  {sections.map((section, sectionIndex) => {
                    const sectionQuestions = cheatSheet ? [] : questionsFor(section, questions)
                    return (
                      <section
                        key={sectionIndex}
                        id={sectionId(sectionIndex)}
                        className="grid scroll-mt-20 gap-2"
                      >
                        {section.heading !== null && (
                          <div className="mb-3 flex items-center justify-between gap-4">
                            <h2 className="display-s">
                              <InlineText text={section.heading} />
                            </h2>
                            <CopyButton
                              label="Copy this section"
                              content={() => notesForClipboard([section])}
                            />
                          </div>
                        )}
                        {groupEntries(section.blocks).map((group, groupIndex, groups) =>
                          renderBlock(
                            group,
                            `${artifact.id}:${sectionIndex}:${groupIndex}`,
                            groups[groupIndex - 1],
                            groups[groupIndex + 1],
                          ),
                        )}
                        {sectionQuestions.length > 0 && (
                          <Link
                            href={`/study/${jobId}?questions=${sectionQuestions.map((question) => question.id).join(',')}`}
                            className="link ui-s justify-self-start pt-3"
                          >
                            Try {plural(sectionQuestions.length, 'question')} on this
                          </Link>
                        )}
                      </section>
                    )
                  })}
                </Tabs.Content>
              )
            })}
            {questions.length > 0 && (
              <Tabs.Content value={QUESTIONS_TAB} className="animate-fade outline-none">
                <ol>
                  {questions.map((question, index) => (
                    <li
                      key={question.id}
                      className="grid animate-rise grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-5 first:border-t-0"
                      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                    >
                      <span className="mono text-ink-3">{String(index + 1).padStart(2, '0')}</span>
                      <span className="reading-m">
                        <InlineText text={question.question} />
                      </span>
                      <span className="mono text-xs text-schedule-ink">
                        {question.dueAt !== null && <ShortDate value={question.dueAt} />}
                      </span>
                    </li>
                  ))}
                </ol>
              </Tabs.Content>
            )}
          </Tabs.Root>
        </section>
      </div>
    </main>
  )
}
