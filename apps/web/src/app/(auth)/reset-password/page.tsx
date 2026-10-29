'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { TextField } from '@/components/text-field'
import { authClient, MIN_PASSWORD_LENGTH } from '@/lib/auth-client'
import { authErrorCopy } from '@/lib/error-copy'
import { submitWith } from '@/lib/forms'
import { Outcome } from '@/components/outcome'

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (token === null) {
    return (
      <>
        <Outcome tone="failed">
          <h1 className="display-m">This link does not work</h1>
          <p className="ui-m text-ink-2">It may be old or used already.</p>
        </Outcome>
        <Link href="/forgot-password" className="btn btn-primary justify-self-start">
          Send a new link
        </Link>
      </>
    )
  }

  async function reset(form: FormData) {
    setPending(true)
    setFailure(null)
    const result = await authClient
      .resetPassword({ token: token!, newPassword: String(form.get('password')) })
      .catch(() => null)
    setPending(false)
    if (result === null || result.error) {
      setFailure(authErrorCopy('setPassword', result?.error ?? null))
      return
    }
    router.push('/login')
  }

  return (
    <>
      <h1 className="display-m">Set a new password</h1>
      <form onSubmit={submitWith(reset)} className="grid gap-4">
        <TextField
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {failure !== null && (
          <p role="alert" className="ui-s font-medium text-missed">
            {failure}{' '}
            <Link href="/forgot-password" className="link">
              Send a new link
            </Link>
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 w-full" disabled={pending}>
          Set password
        </button>
      </form>
    </>
  )
}
