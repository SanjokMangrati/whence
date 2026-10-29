'use client'

import type { ReactNode } from 'react'

export function Switch({
  on,
  onChange,
  disabled = false,
  size = 'm',
  children,
}: {
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  size?: 's' | 'm'
  children: ReactNode
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2.5 ${size === 's' ? 'ui-s text-ink-2' : 'ui-m'}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-[18px] w-8 shrink-0 cursor-pointer rounded-[9px] transition-colors duration-200 ease-out ${on ? 'bg-ink' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-0.5 size-3.5 rounded-[7px] bg-card transition-[left] duration-200 ease-out ${on ? 'left-4' : 'left-0.5'}`}
        />
      </button>
      {children}
    </label>
  )
}
