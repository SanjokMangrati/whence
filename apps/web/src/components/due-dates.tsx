import { ShortDate } from './short-date'

export function DueDates({
  title,
  dates,
}: {
  title: string
  dates: { date: string; caption: string }[]
}) {
  return (
    <div className="grid gap-2.5">
      <h2 className="mono-label text-ink-3">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {dates.map(({ date, caption }, index) => (
          <li
            key={date}
            className="grid min-w-[72px] animate-rise gap-0.5 rounded-sm bg-schedule-wash px-2.5 py-2 text-schedule-ink"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <span className="mono">
              <ShortDate value={date} />
            </span>
            <span className="ui-s opacity-85">{caption}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
