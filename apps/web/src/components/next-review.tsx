'use client'

import { useSyncExternalStore } from 'react'
import { daysFromToday } from '@/lib/format'
import { ShortDate } from './short-date'
import { Tag } from './tag'

const subscribe = () => () => {}

export function NextReview({ value }: { value: string }) {
  const due = useSyncExternalStore(
    subscribe,
    () => daysFromToday(new Date(value)) <= 0,
    () => value.slice(0, 10) <= new Date().toISOString().slice(0, 10),
  )
  return due ? (
    <Tag tone="schedule">Due today</Tag>
  ) : (
    <span className="mono text-xs whitespace-nowrap text-schedule-ink">
      NEXT <ShortDate value={value} />
    </span>
  )
}
