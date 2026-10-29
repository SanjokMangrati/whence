import { ArrowLeft, ArrowRight, ChevronDown, Link as LinkIcon } from 'lucide-react'
import { Img, staticFile } from 'remotion'
import { Icon } from '@/components/icon'
import { OutputOption } from '@/components/output-option'
import { Tag } from '@/components/tag'
import { UsageRing } from '@/components/usage-ring'
import { plural, reviewMinutes, shortDate } from '@/lib/format'

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

export function AppHeader({ due }: { due: number }) {
  return (
    <header className="border-b border-line">
      <div className="flex h-[60px] items-center gap-7 px-8">
        <Img src={staticFile('whence-lockup.svg')} alt="Whence" width={124} height={18} />
        <nav className="flex items-center gap-1">
          <span className="ui-m inline-flex h-8 items-center gap-2 rounded-sm bg-paper-2 px-2.5 font-medium text-ink">
            Home
          </span>
          <span className="ui-m inline-flex h-8 items-center gap-2 rounded-sm px-2.5 font-medium text-ink-3">
            Quiz
            {due > 0 && <Tag tone="schedule">{due}</Tag>}
          </span>
        </nav>
        <span className="btn btn-ghost btn-sm ml-auto gap-2 pr-2 pl-1.5">
          <span className="reading-m grid size-7 place-items-center rounded-sm bg-ink leading-none text-paper uppercase">
            a
          </span>
          <Icon icon={ChevronDown} size={14} className="text-ink-3" />
        </span>
      </div>
    </header>
  )
}

export interface HomeRow {
  title: string
  meta: string
  next: Date
}

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function monthCells(today: number): (number | null)[][] {
  const date = new Date(today)
  const year = date.getFullYear()
  const month = date.getMonth()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const length = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, index) => index + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const rows = []
  for (let start = 0; start < cells.length; start += 7) rows.push(cells.slice(start, start + 7))
  return rows
}

function Calendar({
  today,
  reviews,
  selected,
  sourceTitle,
}: {
  today: number
  reviews: Date[]
  selected: Date | null
  sourceTitle: string
}) {
  const shown = new Date(today)
  const reviewDays = new Set(reviews.map((date) => startOfDay(date.getTime())))
  const dayOf = (day: number) => new Date(shown.getFullYear(), shown.getMonth(), day).getTime()
  const selectedDay = selected === null ? null : startOfDay(selected.getTime())
  const next = reviews.find((date) => date.getTime() > today)

  return (
    <section className="grid gap-4 rounded-md border border-line bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="mono-label text-ink-3">
          {MONTHS[shown.getMonth()]} {shown.getFullYear()}
        </h2>
        <div className="-mr-2 flex items-center gap-1 text-ink-4">
          <span className="btn btn-ghost btn-sm w-8 px-0 opacity-50">
            <Icon icon={ArrowLeft} size={16} />
          </span>
          <span className="btn btn-ghost btn-sm w-8 px-0 text-ink">
            <Icon icon={ArrowRight} size={16} />
          </span>
        </div>
      </div>
      <div className="grid gap-5">
        <table className="-mx-0.5 w-full table-fixed">
          <thead>
            <tr>
              {WEEKDAYS.map((weekday) => (
                <th key={weekday} className="mono-label pb-1 font-medium text-ink-4">
                  {weekday.slice(0, 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthCells(today).map((week, row) => (
              <tr key={row}>
                {week.map((day, column) => {
                  if (day === null) return <td key={column} className="p-0.5" />
                  const time = dayOf(day)
                  const isToday = time === today
                  const tone =
                    time === selectedDay
                      ? 'bg-schedule-ink text-paper'
                      : reviewDays.has(time)
                        ? 'bg-schedule-wash text-schedule-ink'
                        : time < today
                          ? 'text-ink-4'
                          : 'text-ink-2'
                  return (
                    <td key={column} className="p-0.5">
                      <div
                        data-anchor={
                          next !== undefined && time === startOfDay(next.getTime())
                            ? 'next-day'
                            : undefined
                        }
                        className={`grid h-10 w-full place-items-center rounded-sm border border-transparent ${tone} ${isToday ? 'outline-1 outline-offset-1 outline-ink' : ''}`}
                      >
                        <span className={`mono tabular-nums ${isToday ? 'font-medium' : ''}`}>
                          {day}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line pt-4">
          {selected === null ? (
            <p className="ui-s text-center text-ink-3">Nothing here</p>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <p className="mono-label text-schedule-ink">
                  {WEEKDAYS[(selected.getDay() + 6) % 7]} · {shortDate(selected)}
                </p>
                <p className="ui-m">
                  <span className="font-medium">{plural(1, 'question')}</span>
                  <span className="text-ink-3"> · about {plural(reviewMinutes(1), 'minute')}</span>
                </p>
              </div>
              <ul className="grid">
                <li className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                  <span className="ui-m line-clamp-2 min-w-0">{sourceTitle}</span>
                  <span className="mono shrink-0 text-ink-3">1</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const MAKE = {
  notes: 'Make notes',
  both: 'Make notes and cheat sheet',
} as const

export function HomeScreen({
  today,
  link,
  sheet,
  pressed,
  used,
  limit,
  rows,
  reviews,
  selected,
  sourceTitle,
}: {
  today: number
  link: string
  sheet: boolean
  pressed: boolean
  used: number
  limit: number
  rows: HomeRow[]
  reviews: Date[]
  selected: Date | null
  sourceTitle: string
}) {
  return (
    <>
      <AppHeader due={0} />
      <main className="grid grid-cols-[minmax(0,1fr)_340px] gap-x-24 px-8 pt-14">
        <div className="grid min-w-0 content-start gap-10">
          <section className="grid gap-5">
            <h1 className="display-l">
              What do you want to <i>remember</i>?
            </h1>
            <div
              data-focus="composer"
              className="grid rounded-md border border-line-strong bg-card"
            >
              <div className="flex h-[60px] items-center gap-3 px-[18px] text-ink-3">
                <Icon icon={LinkIcon} />
                {link === '' ? (
                  <span className="ui-l text-ink-4">Paste a YouTube or article link</span>
                ) : (
                  <span className="ui-l text-ink">{link}</span>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-line p-2.5">
                <div className="flex gap-2">
                  <OutputOption
                    label="Notes"
                    detail="For detailed comprehension"
                    checked
                    onChange={() => {}}
                  />
                  <span data-anchor="sheet">
                    <OutputOption
                      label="Cheat sheet"
                      detail="For quick revision"
                      checked={sheet}
                      onChange={() => {}}
                    />
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <UsageRing used={used} limit={limit} period="month" />
                  <span
                    data-anchor="make"
                    className={`btn btn-primary ${pressed ? 'translate-y-px bg-ink-2' : ''}`}
                  >
                    {sheet ? MAKE.both : MAKE.notes}
                    <Icon icon={ArrowRight} size={17} />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between pb-3">
              <h2 className="display-s">Sources</h2>
            </div>
            {rows.length === 0 ? (
              <p className="ui-m border-t border-line pt-5 text-ink-3">
                Paste a YouTube video or an article above. Its notes appear here.
              </p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li
                    key={row.title}
                    className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-start gap-x-4 border-t border-line py-5"
                  >
                    <span>
                      <Tag tone="outline">video</Tag>
                    </span>
                    <span className="grid min-w-0 gap-1.5">
                      <span className="display-s line-clamp-2">{row.title}</span>
                      <span className="mono-label text-ink-3">{row.meta}</span>
                    </span>
                    <span className="mono pt-1 text-xs whitespace-nowrap text-schedule-ink">
                      NEXT {shortDate(row.next)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-4 pt-2">
          <div className="grid gap-1.5 rounded-md bg-paper-2 p-6">
            <h2 className="mono-label text-ink-3">Due today</h2>
            <p className="display-m">{plural(0, 'question')}</p>
          </div>
          <div data-focus="calendar" className="min-h-[494px]">
            <Calendar
              today={today}
              reviews={reviews}
              selected={selected}
              sourceTitle={sourceTitle}
            />
          </div>
        </aside>
      </main>
    </>
  )
}
