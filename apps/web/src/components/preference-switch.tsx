'use client'

import type { ReactNode } from 'react'
import { Switch } from './switch'
import { setPreference, usePreference, type Preference } from '@/lib/preferences'

export function PreferenceSwitch({
  name,
  size = 'm',
  children,
}: {
  name: Preference
  size?: 's' | 'm'
  children: ReactNode
}) {
  const on = usePreference(name)

  return (
    <Switch on={on} onChange={(value) => setPreference(name, value)} size={size}>
      {children}
    </Switch>
  )
}
