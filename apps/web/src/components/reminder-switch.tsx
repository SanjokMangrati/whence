'use client'

import { useState } from 'react'
import { Switch } from './switch'
import { track } from '@/lib/analytics'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'

export function ReminderSwitch({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled)
  const [state, setState] = useState<'idle' | 'working' | { failure: string }>('idle')

  async function change(value: boolean) {
    setOn(value)
    setState('working')
    const response = await api.study.reminders.$put({ json: { enabled: value } }).catch(() => null)
    if (response?.ok) {
      if (value) track('reminders_enabled', {})
      setState('idle')
    } else {
      setOn(!value)
      setState({ failure: actionErrorCopy('save', await readErrorCode(response)) })
    }
  }

  return (
    <>
      <Switch on={on} onChange={change} disabled={state === 'working'}>
        Email me when questions are due
      </Switch>
      {typeof state === 'object' && (
        <p role="alert" className="ui-s text-missed">
          {state.failure}
        </p>
      )}
    </>
  )
}
