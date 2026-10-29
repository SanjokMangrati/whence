'use client'

import { useSyncExternalStore } from 'react'

const DEFAULTS = {
  'show-shortcuts': false,
  'play-on-click': true,
} as const

export type Preference = keyof typeof DEFAULTS

const EVENT = 'preference-change'
const memory = new Map<Preference, boolean>()

function read(name: Preference): boolean {
  const kept = memory.get(name)
  if (kept !== undefined) return kept
  try {
    const stored = window.localStorage.getItem(name)
    return stored === null ? DEFAULTS[name] : stored === 'true'
  } catch {
    return DEFAULTS[name]
  }
}

function subscribe(onChange: () => void) {
  const onStorage = () => {
    memory.clear()
    onChange()
  }
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function usePreference(name: Preference): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(name),
    () => DEFAULTS[name],
  )
}

export function setPreference(name: Preference, value: boolean) {
  memory.set(name, value)
  try {
    window.localStorage.setItem(name, String(value))
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}
