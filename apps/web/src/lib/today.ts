'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

function startOfToday(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

export function useToday(): number | null {
  return useSyncExternalStore(subscribe, startOfToday, () => null)
}
