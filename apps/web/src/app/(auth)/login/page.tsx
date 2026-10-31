'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState } from 'react'
import { DemoAccount } from '@/components/demo-account'
import { TextField } from '@/components/text-field'
import { identify } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { authErrorCopy } from '@/lib/error-copy'
import { submitWith, withLink } from '@/lib/forms'

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { link } = use(searchParams)
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function logIn(form: FormData) {
    setPending(true)
    setFailure(null)
    const result = await authClient.signIn
      .email({
        email: String(form.get('email')),
        password: String(form.get('password')),
      })
      .catch(() => null)
    setPending(false)
    if (result === null || result.error) {
      setFailure(authErrorCopy('logIn', result?.error ?? null))
      return
    }
    identify(result.data.user.id)
    router.push(withLink('/', link))
    router.refresh()
  }

  return (
    <>
      <h1 className="display-m">Log in</h1>
      <form onSubmit={submitWith(logIn)} className="grid gap-4">
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {failure !== null && (
          <p role="alert" className="ui-s font-medium text-missed">
            {failure}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 w-full" disabled={pending}>
          Log in
        </button>
      </form>
      <DemoAccount />
      <div className="ui-s grid gap-1 text-ink-3">
        <p>
          <Link href="/forgot-password" className="link">
            Forgot your password?
          </Link>
        </p>
        <p>
          No account?{' '}
          <Link href={withLink('/signup', link)} className="link">
            Sign up
          </Link>
        </p>
      </div>
    </>
  )
}
