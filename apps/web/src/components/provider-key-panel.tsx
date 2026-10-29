'use client'

import { useState } from 'react'
import { TextField } from './text-field'
import { track } from '@/lib/analytics'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { submitWith } from '@/lib/forms'

interface KeyStatus {
  set: boolean
  last4: string | null
}

function Revoke() {
  return (
    <>
      When you are done, delete it here and revoke it in the{' '}
      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noreferrer"
        className="link"
      >
        Anthropic console
      </a>
      .
    </>
  )
}

export function ProviderKeyPanel({ initial }: { initial: KeyStatus }) {
  const [status, setStatus] = useState(initial)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(form: FormData) {
    setPending(true)
    setFailure(null)
    const response = await api.me['provider-key']
      .$put({ json: { key: String(form.get('key')).trim() } })
      .catch(() => null)
    setPending(false)
    if (response?.ok) {
      track('provider_key_saved', {})
      setStatus(await response.json())
    } else {
      setFailure(actionErrorCopy('saveKey', await readErrorCode(response)))
    }
  }

  async function remove() {
    setPending(true)
    setFailure(null)
    const response = await api.me['provider-key'].$delete().catch(() => null)
    setPending(false)
    if (response?.ok) {
      setStatus({ set: false, last4: null })
    } else {
      setFailure(actionErrorCopy('deleteKey', await readErrorCode(response)))
    }
  }

  const alert = failure !== null && (
    <p role="alert" className="ui-s text-missed">
      {failure}
    </p>
  )

  if (status.set) {
    return (
      <>
        <p className="ui-l">Key ending in {status.last4}</p>
        <p className="ui-m text-ink-2">
          <Revoke />
        </p>
        {alert}
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={remove}
            disabled={pending}
          >
            Delete key
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="ui-m text-ink-2">
        The demo makes notes with your own Anthropic key. Each source spends on your Anthropic
        account, and the demo shows what each source cost.
      </p>
      <p className="ui-m text-ink-2">
        Make a new key for this demo. <Revoke />
      </p>
      <form onSubmit={submitWith(save)} className="grid gap-3">
        <TextField
          label="Anthropic key"
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-"
          required
        />
        {alert}
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            Save key
          </button>
        </div>
      </form>
    </>
  )
}
