'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Tag } from './tag'

export function AppNav({ due }: { due: number }) {
  const pathname = usePathname()
  const inQuiz = pathname.startsWith('/quiz')
  const inAccount = pathname.startsWith('/settings') || pathname.startsWith('/billing')

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      <NavLink href="/" current={!inQuiz && !inAccount}>
        Home
      </NavLink>
      <NavLink href="/quiz" current={inQuiz}>
        Quiz
        {due > 0 && (
          <Tag tone="schedule">
            <span className="sr-only">, </span>
            {due}
            <span className="sr-only"> due</span>
          </Tag>
        )}
      </NavLink>
    </nav>
  )
}

function NavLink({
  href,
  current,
  children,
}: {
  href: '/' | '/quiz'
  current: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className="ui-m inline-flex h-8 items-center gap-2 rounded-sm px-2.5 font-medium text-ink-3 transition-colors duration-120 hover:bg-paper-2 aria-[current=page]:bg-paper-2 aria-[current=page]:text-ink"
    >
      {children}
    </Link>
  )
}
