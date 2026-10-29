import type { ReactNode } from 'react'

const TONE = {
  neutral: 'bg-paper-2 text-ink-2',
  outline: 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
  source: 'bg-source-wash text-source-ink',
  schedule: 'bg-schedule-wash text-schedule-ink',
} as const

export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONE
  children: ReactNode
}) {
  return (
    <span
      className={`mono-label inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap tabular-nums ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}
