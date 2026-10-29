import { hostName } from 'notes-format'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAY_MS = 24 * 60 * 60 * 1000

export function shortDate(value: Date | string, timeZone?: 'UTC'): string {
  const date = new Date(value)
  const [day, month] =
    timeZone === 'UTC' ? [date.getUTCDate(), date.getUTCMonth()] : [date.getDate(), date.getMonth()]
  return `${MONTHS[month]} ${String(day).padStart(2, '0')}`
}

export function daysFromToday(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return Math.round((day.getTime() - today.getTime()) / DAY_MS)
}

const SECONDS_PER_QUESTION = 30

export function reviewMinutes(questions: number): number {
  return Math.max(1, Math.round((questions * SECONDS_PER_QUESTION) / 60))
}

export function libraryTitle(item: {
  requestedUrl: string
  source: { title: string | null } | null
}): string {
  return item.source?.title ?? bareUrl(item.requestedUrl)
}

function bareUrl(url: string): string {
  const parsed = new URL(url)
  return `${hostName(url)}${parsed.pathname === '/' ? '' : parsed.pathname}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
