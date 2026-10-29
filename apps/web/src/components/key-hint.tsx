'use client'

import { usePreference } from '@/lib/preferences'

export function KeyHint({ children }: { children: string }) {
  const show = usePreference('show-shortcuts')
  if (!show) return null
  return (
    <span aria-hidden="true" className="mono text-[11px] text-ink-4">
      {children}
    </span>
  )
}
