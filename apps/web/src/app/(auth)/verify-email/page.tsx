import Link from 'next/link'
import { redirect } from 'next/navigation'
import { withLink } from '@/lib/forms'
import { Outcome } from '@/components/outcome'

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const { error, link } = await searchParams
  if (error === undefined) redirect(withLink('/', link))

  return (
    <>
      <Outcome tone="failed">
        <h1 className="display-m">This link does not work</h1>
        <p className="ui-m text-ink-2">
          It may be old or used already. Log in, and a new link goes to your email.
        </p>
      </Outcome>
      <Link href={withLink('/login', link)} className="btn btn-secondary justify-self-start">
        Log in
      </Link>
    </>
  )
}
