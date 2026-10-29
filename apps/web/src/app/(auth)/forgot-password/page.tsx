'use client'

import Link from 'next/link'
import { useState } from 'react'
import { TextField } from '@/components/text-field'
import { authClient } from '@/lib/auth-client'
import { authErrorCopy } from '@/lib/error-copy'
import { submitWith } from '@/lib/forms'
import { Outcome } from '@/components/outcome'

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function requestReset(form: FormData) {
    setPending(true)
    setFailure(null)
    const result = await authClient
      .requestPasswordReset({ email: String(form.get('email')), redirectTo: '/reset-password' })
      .catch(() => null)
    setPending(false)
    if (result === null || result.error) {
      setFailure(authErrorCopy('sendLink', result?.error ?? null))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <>
        <Outcome tone="done">
          <h1 className="display-m">Check your email</h1>
          <p className="ui-m text-ink-2">
            If an account uses this email, a link to set a new password is on its way.
          </p>
        </Outcome>
        <Link href="/login" className="btn btn-secondary justify-self-start">
          Log in
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className="display-m">Set a new password</h1>
      <form onSubmit={submitWith(requestReset)} className="grid gap-4">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        {failure !== null && (
          <p role="alert" className="ui-s font-medium text-missed">
            {failure}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 w-full" disabled={pending}>
          Send the link
        </button>
      </form>
      <p className="ui-s text-ink-3">
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </>
  )
}
