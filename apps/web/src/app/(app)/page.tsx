import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import { LibraryList } from '@/components/library-list'
import { PasteForm } from '@/components/paste-form'
import { ReviewCalendar } from '@/components/review-calendar'
import { currentUser, dueQuestions, serverApi } from '@/lib/api-server'
import { libraryTitle, plural, reviewMinutes } from '@/lib/format'
import { librarySort, type LibrarySort } from '@/lib/library-sort'

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const api = await serverApi()
  const now = new Date()
  const month = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
  const [
    me,
    { items: allItems },
    due,
    calendar,
    { items: collections },
    { collection: selectedId, sort: sortParam, link },
  ] = await Promise.all([
    currentUser(),
    api.generations.$get().then((response) => response.json()),
    dueQuestions(),
    api.study.calendar
      .$get({ query: { month: `${month.year}-${String(month.month).padStart(2, '0')}` } })
      .then((response) => {
        if (response.status !== 200) throw new Error(`The API returned ${response.status}.`)
        return response.json()
      }),
    api.collections.$get().then((response) => response.json()),
    searchParams,
  ])
  const selected = collections.find((collection) => collection.id === selectedId) ?? null
  const sort = librarySort(sortParam)
  const items = (
    selected === null ? allItems : allItems.filter((item) => selected.jobIds.includes(item.id))
  ).toSorted(ORDER[sort])
  const dueCount = due.items.length
  const dueSources = new Set(due.items.map((item) => item.sourceId)).size
  const dueMinutes = reviewMinutes(dueCount)

  return (
    <main className="mx-auto grid w-full max-w-page gap-14 px-4 pt-10 pb-24 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-24">
      <div className="grid min-w-0 content-start gap-10">
        <section aria-labelledby="ask" className="grid gap-5">
          <h1 id="ask" className="display-m sm:display-l">
            What do you want to <i>remember</i>?
          </h1>
          <PasteForm
            plan={me.plan}
            used={me.sourcesUsed}
            limit={me.sourcesPerPeriod}
            initialUrl={typeof link === 'string' ? link : undefined}
          />
        </section>

        <LibraryList
          items={items}
          plan={me.plan}
          collections={collections}
          selected={selected === null ? null : { id: selected.id, name: selected.name }}
          sort={sort}
        />
      </div>

      <aside className="grid animate-rise content-start gap-4 [animation-delay:120ms] lg:pt-2">
        <div className="grid gap-5 rounded-md bg-paper-2 p-6">
          <div className="grid gap-1.5">
            <h2 className="mono-label text-ink-3">Due today</h2>
            <p className="display-m">{plural(dueCount, 'question')}</p>
            {dueCount > 0 && (
              <p className="ui-s text-ink-3">
                From {plural(dueSources, 'source')} · about {plural(dueMinutes, 'minute')}
              </p>
            )}
          </div>
          {dueCount > 0 && (
            <Link href="/quiz" className="btn btn-primary w-full">
              Start quiz
              <Icon icon={ArrowRight} size={17} />
            </Link>
          )}
        </div>
        <ReviewCalendar
          serverToday={Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())}
          initial={{ month, reviews: calendar.reviews }}
          sources={Object.fromEntries(allItems.map((item) => [item.id, libraryTitle(item)]))}
        />
      </aside>
    </main>
  )
}

interface LibraryItem {
  requestedUrl: string
  createdAt: string
  nextReviewAt: string | null
  source: { title: string | null } | null
}

const newestFirst = (a: LibraryItem, b: LibraryItem) => b.createdAt.localeCompare(a.createdAt)

const ORDER: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
  newest: newestFirst,
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  next: (a, b) =>
    a.nextReviewAt === b.nextReviewAt
      ? newestFirst(a, b)
      : a.nextReviewAt === null
        ? 1
        : b.nextReviewAt === null
          ? -1
          : a.nextReviewAt.localeCompare(b.nextReviewAt),
  title: (a, b) =>
    libraryTitle(a).localeCompare(libraryTitle(b), undefined, { sensitivity: 'base' }),
}
