'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function TabBar({
  label,
  tabs,
  value,
  children,
}: {
  label: string
  tabs: { value: string; label: string; count?: number }[]
  value: string
  children?: ReactNode
}) {
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const trigger = triggers.current.get(value)
    if (trigger !== undefined) setBar({ left: trigger.offsetLeft, width: trigger.offsetWidth })
  }, [value, tabs.length])

  return (
    <div className="relative">
      <Tabs.List
        aria-label={label}
        className={`relative flex gap-7 border-b border-line ${children ? 'pr-10' : ''}`}
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            ref={(element) => {
              if (element === null) triggers.current.delete(tab.value)
              else triggers.current.set(tab.value, element)
            }}
            className="ui-m inline-flex cursor-pointer items-center gap-2 pb-3 font-medium text-ink-3 transition-colors duration-120 hover:text-ink data-[state=active]:text-ink"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="mono text-xs text-ink-3">{tab.count}</span>
            )}
          </Tabs.Trigger>
        ))}
        {bar !== null && (
          <span
            aria-hidden="true"
            className="absolute -bottom-px h-0.5 bg-ink transition-[left,width] duration-200 ease-out"
            style={{ left: bar.left, width: bar.width }}
          />
        )}
      </Tabs.List>
      {children && <div className="absolute -top-1.5 right-0">{children}</div>}
    </div>
  )
}
