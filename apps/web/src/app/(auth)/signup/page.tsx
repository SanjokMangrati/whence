'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { DemoAccount } from '@/components/demo-account'
import { TextField } from '@/components/text-field'
import { identify, track } from '@/lib/analytics'
import { authClient, MIN_PASSWORD_LENGTH } from '@/lib/auth-client'
import { authErrorCopy } from '@/lib/error-copy'
import { submitWith, withLink } from '@/lib/forms'
import { Outcome } from '@/components/outcome'

export default function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { link } = use(searchParams)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signUp(form: FormData) {
    const email = String(form.get('email'))
    setPending(true)
    setFailure(null)
    const result = await authClient.signUp
      .email({
        email,
        name: email,
        password: String(form.get('password')),
        callbackURL: withLink('/verify-email', link),
      })
      .catch(() => null)
    setPending(false)
    if (result === null || result.error) {
      setFailure(authErrorCopy('signUp', result?.error ?? null))
      return
    }
    identify(result.data.user.id)
    track('signed_up', {})
    setSentTo(email)
  }

  if (sentTo !== null) {
    return (
      <>
        <Outcome tone="done">
          <h1 className="display-m">Check your email</h1>
          <p className="ui-m text-ink-2">
            A link to confirm {sentTo} is on its way. Open it to log in.
          </p>
        </Outcome>
      </>
    )
  }

  return (
    <>
      <h1 className="display-m">Sign up</h1>
      <form onSubmit={submitWith(signUp)} className="grid gap-4">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {failure && (
          <p role="alert" className="ui-s font-medium text-missed">
            {failure}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 w-full" disabled={pending}>
          Sign up
        </button>
      </form>
      <DemoAccount />
      <p className="ui-s text-ink-3">
        Have an account?{' '}
        <Link href={withLink('/login', link)} className="link">
          Log in
        </Link>
      </p>
    </>
  )
}
