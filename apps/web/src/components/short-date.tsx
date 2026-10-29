'use client'

import { useSyncExternalStore } from 'react'
import { shortDate } from '@/lib/format'

const subscribe = () => () => {}

export function ShortDate({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => shortDate(value),
    () => shortDate(value, 'UTC'),
  )
  return <time dateTime={value}>{text}</time>
}
