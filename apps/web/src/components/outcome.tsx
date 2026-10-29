import type { ReactNode } from 'react'

const RULE = { failed: 'border-missed', done: 'border-remembered' }

export function Outcome({ tone, children }: { tone: keyof typeof RULE; children: ReactNode }) {
  return <div className={`grid gap-3 border-l-2 pl-4 ${RULE[tone]}`}>{children}</div>
}
