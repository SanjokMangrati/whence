'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export function RevealGroup({
  className = '',
  stagger = 80,
  children,
}: {
  className?: string
  stagger?: number
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = root.current
    if (box === null) return
    const items = [...box.querySelectorAll<HTMLElement>('.reveal')]
    let next = 0
    const observer = new IntersectionObserver(
      (entries) => {
        const last = Math.max(
          -1,
          ...entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => items.findIndex((item) => item === entry.target)),
        )
        let step = 0
        for (; next <= last; next++) {
          const item = items[next]!
          observer.unobserve(item)
          if (item.dataset.shown !== undefined) continue
          item.style.animationDelay = `${step++ * stagger}ms`
          item.dataset.shown = ''
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    for (const item of items) observer.observe(item)
    return () => observer.disconnect()
  }, [stagger])

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  )
}
