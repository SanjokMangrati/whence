'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from './icon'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { plural, reviewMinutes, shortDate } from '@/lib/format'
import { useToday } from '@/lib/today'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Month {
  year: number
  month: number
}

interface Review {
  jobId: string
  dueAt: string
}

interface Cell {
  day: number
  inMonth: boolean
}

const pad = (value: number) => String(value).padStart(2, '0')
const monthKey = ({ year, month }: Month) => `${year}-${pad(month)}`
const sum = (counts: Iterable<number>) => [...counts].reduce((total, count) => total + count, 0)

function addMonth({ year, month }: Month, step: number): Month {
  const index = year * 12 + month - 1 + step
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function dayKey(time: number, utc: boolean): string {
  const date = new Date(time)
  return utc
    ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateOf(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
}

function weeks({ year, month }: Month): Cell[][] {
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const previousLength = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()
  const cells: Cell[] = [
    ...Array.from({ length: lead }, (_, index) => ({
      day: previousLength - lead + index + 1,
      inMonth: false,
    })),
    ...Array.from({ length }, (_, index) => ({ day: index + 1, inMonth: true })),
  ]
  for (let day = 1; cells.length % 7 !== 0; day++) cells.push({ day, inMonth: false })
  const rows = []
  for (let start = 0; start < cells.length; start += 7) rows.push(cells.slice(start, start + 7))
  return rows
}

export function ReviewCalendar({
  serverToday,
  initial,
  sources,
}: {
  serverToday: number
  initial: { month: Month; reviews: Review[] }
  sources: Record<string, string>
}) {
  const localToday = useToday()
  const utc = localToday === null
  const today = localToday ?? serverToday
  const todayKey = dayKey(today, utc)
  const current: Month = {
    year: Number(todayKey.slice(0, 4)),
    month: Number(todayKey.slice(5, 7)),
  }

  const [picked, setPicked] = useState<Month | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Record<string, Review[]>>({
    [monthKey(initial.month)]: initial.reviews,
  })
  const [failure, setFailure] = useState<{ month: string; line: string } | null>(null)

  const shown = picked ?? current
  const shownKey = monthKey(shown)
  const monthName = MONTHS[shown.month - 1]
  const reviews = loaded[shownKey]
  const failedLine = failure?.month === shownKey ? failure.line : null

  useEffect(() => {
    if (reviews !== undefined || failedLine !== null) return
    let live = true
    void (async () => {
      const response = await api.study.calendar
        .$get({ query: { month: shownKey } })
        .catch(() => null)
      if (!live) return
      if (response?.status !== 200) {
        const line = actionErrorCopy('dates', await readErrorCode(response))
        setFailure({ month: shownKey, line })
        return
      }
      const body = await response.json()
      setLoaded((previous) => ({ ...previous, [shownKey]: body.reviews }))
    })()
    return () => {
      live = false
    }
  }, [reviews, failedLine, shownKey])

  const days = useMemo(() => {
    const byDay = new Map<string, Map<string, number>>()
    for (const { jobId, dueAt } of reviews ?? []) {
      const key = dayKey(Math.max(Date.parse(dueAt), today), utc)
      const jobs = byDay.get(key) ?? new Map<string, number>()
      jobs.set(jobId, (jobs.get(jobId) ?? 0) + 1)
      byDay.set(key, jobs)
    }
    return byDay
  }, [reviews, today, utc])

  const reviewDays = [...days.keys()].filter((key) => key.startsWith(shownKey)).toSorted()
  const open =
    selected !== null && days.has(selected)
      ? selected
      : (reviewDays.find((key) => key > todayKey) ??
        (reviewDays.includes(todayKey) ? todayKey : null))
  const openJobs = open === null ? undefined : days.get(open)

  function go(step: number) {
    setPicked(addMonth(shown, step))
    setSelected(null)
  }

  return (
    <section
      aria-labelledby="calendar"
      className="grid gap-4 rounded-md border border-line bg-card p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="calendar" aria-live="polite" className="mono-label text-ink-3">
          <span className="sr-only">Review dates, </span>
          {monthName} {shown.year}
        </h2>
        <div className="-mr-2 flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm w-8 px-0"
            title="Previous month"
            aria-label="Previous month"
            disabled={shownKey === monthKey(current)}
            onClick={() => go(-1)}
          >
            <Icon icon={ArrowLeft} size={16} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm w-8 px-0"
            title="Next month"
            aria-label="Next month"
            onClick={() => go(1)}
          >
            <Icon icon={ArrowRight} size={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="-mx-0.5">
          <table key={shownKey} className="w-full table-fixed animate-fade">
            <thead>
              <tr>
                {WEEKDAYS.map((weekday) => (
                  <th
                    key={weekday}
                    scope="col"
                    abbr={weekday}
                    className="mono-label pb-1 font-medium text-ink-4"
                  >
                    {weekday.slice(0, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks(shown).map((week, row) => (
                <tr key={row}>
                  {week.map(({ day, inMonth }, column) => {
                    const key = `${shownKey}-${pad(day)}`
                    return (
                      <td key={column} className="p-0.5">
                        {inMonth && (
                          <Day
                            day={day}
                            questions={sum(days.get(key)?.values() ?? [])}
                            isToday={key === todayKey}
                            past={key < todayKey}
                            selected={key === open}
                            label={shortDate(dateOf(key))}
                            onSelect={() => setSelected(key)}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div aria-live="polite" className="border-t border-line pt-4">
          {failedLine !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="ui-s text-missed">{failedLine}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setFailure(null)}
              >
                Try again
              </button>
            </div>
          ) : reviews === undefined ? (
            <p className="ui-s text-ink-3">Loading the dates for {monthName}.</p>
          ) : open === null || openJobs === undefined ? (
            <p className="ui-s text-center text-ink-3">Nothing here</p>
          ) : (
            <DayDetail
              label={`${open === todayKey ? 'Today' : WEEKDAYS[(dateOf(open).getDay() + 6) % 7]} · ${shortDate(dateOf(open))}`}
              jobs={openJobs}
              sources={sources}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function Day({
  day,
  questions,
  isToday,
  past,
  selected,
  label,
  onSelect,
}: {
  day: number
  questions: number
  isToday: boolean
  past: boolean
  selected: boolean
  label: string
  onSelect: () => void
}) {
  const tone = selected
    ? 'bg-schedule-ink text-paper'
    : questions > 0
      ? 'bg-schedule-wash text-schedule-ink hover:border-schedule'
      : past
        ? 'text-ink-4'
        : 'text-ink-2'
  const cell = `grid h-10 w-full place-items-center rounded-sm border border-transparent ${tone} ${isToday ? 'outline-1 outline-offset-1 outline-ink' : ''}`
  const face = <span className={`mono tabular-nums ${isToday ? 'font-medium' : ''}`}>{day}</span>

  return questions > 0 ? (
    <button
      type="button"
      className={`${cell} cursor-pointer`}
      aria-label={`${label}, ${plural(questions, 'question')}`}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {face}
    </button>
  ) : (
    <div className={cell} aria-current={isToday ? 'date' : undefined}>
      {face}
    </div>
  )
}

function DayDetail({
  label,
  jobs,
  sources,
}: {
  label: string
  jobs: Map<string, number>
  sources: Record<string, string>
}) {
  const total = sum(jobs.values())
  const rows = [...jobs]
    .flatMap(([id, questions]) => {
      const title = sources[id]
      return title === undefined ? [] : [{ id, title, questions }]
    })
    .toSorted((a, b) => b.questions - a.questions || a.title.localeCompare(b.title))

  return (
    <div key={label} className="grid animate-fade gap-3">
      <div className="grid gap-1">
        <p className="mono-label text-schedule-ink">{label}</p>
        <p className="ui-m">
          <span className="font-medium">{plural(total, 'question')}</span>
          <span className="text-ink-3"> · about {plural(reviewMinutes(total), 'minute')}</span>
        </p>
      </div>
      <ul className="grid">
        {rows.map(({ id, title, questions }) => (
          <li key={id} className="border-t border-line">
            <Link
              href={`/generations/${id}`}
              className="group flex items-baseline justify-between gap-3 py-2.5"
            >
              <span className="ui-m line-clamp-2 min-w-0 break-words decoration-1 underline-offset-4 group-hover:underline">
                {title}
              </span>
              <span className="mono shrink-0 text-ink-3">{questions}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
