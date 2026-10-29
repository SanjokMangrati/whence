'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { hostName } from 'notes-format'
import { useState } from 'react'
import { Icon } from './icon'
import { CollectionActions, LibraryFilters } from './library-controls'
import { NextReview } from './next-review'
import { ProgressBar } from './progress-bar'
import { CollectionsMenu, DeleteSourceButton } from './source-menus'
import { Tag } from './tag'
import { libraryTitle, plural } from '@/lib/format'
import type { LibrarySort } from '@/lib/library-sort'
import { PLANS, type Plan } from '@/lib/plans'
import { currentStep } from '@/lib/processing-steps'

type OutputType = 'notes' | 'cheat_sheet' | 'notes_and_cheat_sheet'

export interface LibraryItem {
  id: string
  requestedUrl: string
  outputType: OutputType
  status: 'queued' | 'running' | 'completed' | 'failed'
  stage: Parameters<typeof currentStep>[0]
  createdAt: string
  sourceType: 'video' | 'article'
  source: { title: string | null; channel: string | null } | null
  questions: number
  nextReviewAt: string | null
}

interface Collection {
  id: string
  name: string
  jobIds: string[]
}

const PREPARING = {
  notes: 'Preparing notes',
  cheat_sheet: 'Preparing cheat sheet',
  notes_and_cheat_sheet: 'Preparing notes and cheat sheet',
} as const

export function LibraryList({
  items,
  plan,
  collections,
  selected,
  sort,
}: {
  items: LibraryItem[]
  plan: Plan
  collections: Collection[]
  selected: { id: string; name: string } | null
  sort: LibrarySort
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const shown = items.filter((item) => matches(item, query))

  return (
    <section aria-labelledby="library">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id="library" className="display-s truncate">
            {selected?.name ?? 'Sources'}
          </h2>
          {selected !== null && PLANS[plan].collections && (
            <CollectionActions id={selected.id} name={selected.name} />
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {items.length > 1 && (
            <label className="ui-s flex h-8 min-w-0 flex-1 cursor-text items-center gap-1.5 border-b border-transparent px-0.5 text-ink-3 transition-colors duration-120 ease-out focus-within:border-ink hover:border-line-strong sm:w-56 sm:flex-none">
              <Icon icon={Search} size={14} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a source"
                aria-label="Find a source by title or channel"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:shadow-none focus-visible:outline-none"
              />
            </label>
          )}
          <LibraryFilters
            collections={collections}
            selected={selected?.id ?? null}
            sort={sort}
            sortable={items.length > 1}
          />
        </div>
      </div>
      {selected !== null && items.length === 0 ? (
        <p className="ui-m border-t border-line pt-5 text-ink-3">
          This collection is empty. Open a source and add it from there.
        </p>
      ) : items.length === 0 ? (
        <p className="ui-m border-t border-line pt-5 text-ink-3">
          Paste a YouTube video or an article above. Its notes appear here.
        </p>
      ) : shown.length === 0 ? (
        <p className="ui-m border-t border-line pt-5 break-words text-ink-3">
          No source{selected === null ? '' : ` in ${selected.name}`} matches “{query.trim()}”.
        </p>
      ) : (
        <ul>
          {shown.map((item, index) => {
            const { sourceType } = item
            const ready = item.status === 'completed'
            return (
              <li
                key={item.id}
                className="flex animate-rise items-start gap-2 border-t border-line"
                style={{ animationDelay: `${80 + index * 40}ms` }}
              >
                <Link
                  href={`/generations/${item.id}`}
                  className="group grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-2 py-5 sm:grid-cols-[84px_minmax(0,1fr)_auto] sm:items-start"
                >
                  <span>
                    <Tag tone="outline">{sourceType}</Tag>
                  </span>
                  <span className="grid min-w-0 gap-1.5">
                    <span className="display-s line-clamp-2 break-words decoration-1 underline-offset-4 group-hover:underline">
                      {libraryTitle(item)}
                    </span>
                    {item.status === 'queued' || item.status === 'running' ? (
                      <ProgressBar
                        working
                        value={currentStep(item.stage) + 1}
                        total={4}
                        label={PREPARING[item.outputType].toUpperCase()}
                      />
                    ) : (
                      <span className="mono-label text-ink-3">
                        {[
                          sourceType === 'article' && hostName(item.requestedUrl),
                          ...(ready ? contents(item) : ['Not finished']),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  {ready && item.nextReviewAt !== null && (
                    <span className="sm:pt-1">
                      <NextReview value={item.nextReviewAt} />
                    </span>
                  )}
                </Link>
                <div className="flex shrink-0 justify-end pt-4 sm:w-20">
                  {ready && (
                    <CollectionsMenu plan={plan} jobId={item.id} collections={collections} />
                  )}
                  <DeleteSourceButton
                    jobId={item.id}
                    title={libraryTitle(item)}
                    outputs={ready ? outputs(item) : []}
                    onDeleted={() => router.refresh()}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function matches(item: LibraryItem, query: string): boolean {
  const words = query.trim().toLocaleLowerCase()
  if (words === '') return true
  const article = item.sourceType === 'article'
  return [
    libraryTitle(item),
    item.source?.channel,
    article ? hostName(item.requestedUrl) : null,
  ].some((field) => field?.toLocaleLowerCase().includes(words))
}

function contents(item: { outputType: OutputType; questions: number }): string[] {
  return [
    item.outputType !== 'cheat_sheet' && 'Notes',
    item.outputType !== 'notes' && 'Cheat sheet',
    item.questions > 0 && plural(item.questions, 'question'),
  ].filter((part) => part !== false)
}

function outputs(item: { outputType: OutputType; questions: number }): string[] {
  return [
    item.outputType !== 'cheat_sheet' && 'notes',
    item.outputType !== 'notes' && 'cheat sheet',
    item.questions > 0 && 'questions',
  ].filter((part) => part !== false)
}
