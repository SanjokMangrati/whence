import { useEffect, useRef, useState, type RefObject } from 'react'

export function useInView<T extends Element>(inset: number): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setInView(true)
        observer.disconnect()
      },
      { rootMargin: `0px 0px -${inset}% 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [inset])

  return [ref, inView]
}

export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [onScreen, setOnScreen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
      { rootMargin: '-25% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return onScreen
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
