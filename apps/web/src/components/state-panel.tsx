import Link from 'next/link'
import type { ReactNode } from 'react'

export function StatePanel({
  heading,
  children,
  action,
}: {
  heading: ReactNode
  children: ReactNode
  action: { href: string; label: string }
}) {
  return (
    <main className="mx-auto grid w-full max-w-[640px] content-start gap-5 px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="display-l">{heading}</h1>
      <p className="ui-l text-ink-2">{children}</p>
      <Link href={action.href} className="btn btn-primary mt-2 justify-self-start">
        {action.label}
      </Link>
    </main>
  )
}
